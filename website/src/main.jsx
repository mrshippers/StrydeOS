import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App, { FAQPage, ChangelogPage } from "./strydeOS-website.jsx";
import SecurityPolicyPage from "./security-policy.jsx";
import PrivacyPolicyPage from "./privacy-policy.jsx";
import TermsOfServicePage from "./terms-of-service.jsx";
import AvaPage from "./ava.jsx";
import PulsePage from "./pulse.jsx";
import IntelligencePage from "./intelligence.jsx";
import CaseStudiesPage from "./case-studies.jsx";
import ContactPage from "./contact.jsx";

const path = window.location.pathname.replace(/\/+$/, "") || "/";

function PathRoutedApp() {
  if (path === "/security") return <SecurityPolicyPage />;
  if (path === "/privacy") return <PrivacyPolicyPage />;
  if (path === "/terms") return <TermsOfServicePage />;
  if (path === "/ava") return <AvaPage />;
  if (path === "/pulse") return <PulsePage />;
  if (path === "/intelligence") return <IntelligencePage />;
  if (path === "/faq") return <FAQPage />;
  if (path === "/changelog") return <ChangelogPage />;
  if (path === "/case-studies") return <CaseStudiesPage />;
  if (path === "/contact") return <ContactPage />;
  return <App />;
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <PathRoutedApp />
  </StrictMode>
);
