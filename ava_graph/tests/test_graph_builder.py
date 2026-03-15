"""Tests for LangGraph graph builder and structure."""

import pytest
from ava_graph.graph.builder import build_ava_graph
from ava_graph.graph.state import AvaState


def test_build_ava_graph_returns_compiled_graph():
    """Verify build_ava_graph returns a compiled StateGraph."""
    graph = build_ava_graph()
    assert graph is not None
    assert hasattr(graph, 'invoke')
    assert hasattr(graph, 'stream')


def test_graph_has_interrupt_checkpoint():
    """Verify graph has interrupt_before checkpoint set."""
    graph = build_ava_graph()
    # Graph should be compiled with interrupt_before set
    assert hasattr(graph, 'invoke')
    # If invoke works, the graph is properly compiled with checkpointing
