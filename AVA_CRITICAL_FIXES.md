# Ava Call Dropping - Critical Issues & Fixes

## Core Problems Identified

### 1. **Graph Async Execution Issue** (CRITICAL)
**Location**: `ava_graph/api/routes.py` lines 159-177 and 229-268

**Problem**: 
- Routes use `await graph.ainvoke()` but LangGraph's StateGraph doesn't have an `ainvoke()` method
- The graph is being awaited synchronously which causes the call to hang and timeout
- This causes ElevenLabs to drop the connection

**Fix**: Use `graph.invoke()` (synchronous) inside an asyncio context runner, OR use proper async compilation

### 2. **State Dictionary Return Type Mismatch**
**Location**: All node files in `ava_graph/graph/nodes/`

**Problem**:
- Nodes return `AvaState` (TypedDict) but sometimes return plain `dict`
- In `confirm_booking.py` line 103-107, returns use `dict()` instead of TypedDict
- This breaks type safety and state preservation

**Fix**: All returns must maintain TypedDict signature consistently

### 3. **Async/Await Consistency**
**Location**: `ava_graph/graph/nodes/extract_intent.py`, `propose_slot.py`, etc.

**Problem**:
- Nodes are marked `async def` but don't actually await internal operations
- `propose_slot.py` calls LLM synchronously in async function
- Missing proper error handling for timeout scenarios

**Fix**: Either make nodes fully async or use `asyncio.to_thread()` for sync operations

### 4. **HTTP Client Timeout Too Short**
**Location**: `ava_graph/config.py` line 28

**Problem**:
- `DEFAULT_TIMEOUT = 30.0` seconds is too aggressive for WriteUpp/Cliniko API calls
- PMS APIs can take 15-20+ seconds to respond
- When timeout occurs, the graph aborts and call drops

**Fix**: Increase to 60 seconds, add retry logic with exponential backoff

### 5. **Missing Async Context in Checkpoint Updates**
**Location**: `ava_graph/api/routes.py` lines 251-273

**Problem**:
- `graph.get_state()` and `graph.update_state()` are synchronous but called in async context
- These operations might not properly persist state between webhook calls
- Checkpoint might not be loading correctly on confirmation

**Fix**: Ensure proper context management for checkpoint operations

## Immediate Action Plan

### Phase 1: Fix Core Route Issues (1-2 hours)
1. Replace `await graph.ainvoke()` with synchronous invoke wrapped in asyncio runner
2. Ensure all nodes return consistent AvaState TypedDict instances
3. Add proper logging and error handling for timeout scenarios

### Phase 2: Async Execution Model (2-3 hours)
1. Decide: fully async OR sync-with-wrapper strategy
2. If async: use `asyncio.to_thread()` for blocking operations
3. If sync: use `asyncio.run()` to run graph synchronously

### Phase 3: Timeout & Resilience (1-2 hours)
1. Increase DEFAULT_TIMEOUT to 60 seconds
2. Add retry logic with exponential backoff
3. Add connection keepalive for long operations
4. Add circuit breaker for PMS API failures

### Phase 4: Testing & Validation (2+ hours)
1. Test with actual Spires data
2. Verify checkpoint persistence
3. Load test with multiple concurrent calls
4. Validate ElevenLabs integration doesn't drop calls

## Code Changes Needed

### Fix 1: routes.py - Convert to Sync Invocation
```python
# Instead of:
result = await graph.ainvoke(initial_state, config={"configurable": {"thread_id": webhook.call_id}})

# Use this pattern:
import asyncio
result = await asyncio.to_thread(graph.invoke, initial_state, config={"configurable": {"thread_id": webhook.call_id}})
```

### Fix 2: Consistent State Returns in All Nodes
All nodes should return consistent TypedDict structure.

### Fix 3: Increase Timeouts
```python
DEFAULT_TIMEOUT = 60.0  # seconds
DEFAULT_MAX_RETRIES = 3
```

### Fix 4: Add Retry Logic
Wrap PMS API calls with exponential backoff retry logic.
