import * as React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
  Link,
} from "react-email";

export interface WelcomeEmailProps {
  userEmail: string;
  plan?: string;
}

export function WelcomeEmail({ userEmail, plan = "free" }: WelcomeEmailProps) {
  const planLabel = plan.toUpperCase();

  return (
    <Html>
      <Head />
      <Preview>Welcome to Meterix – your AI metering platform is ready.</Preview>
      <Body style={body}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Heading style={logo}>Meterix</Heading>
            <Text style={tagline}>Developer AI Metering &amp; Telemetry Platform</Text>
          </Section>

          <Hr style={divider} />

          {/* Main Content */}
          <Section style={card}>
            <Heading as="h2" style={cardHeading}>
              Welcome aboard! 🎉
            </Heading>
            <Text style={cardText}>
              Thank you for creating an account with <strong>Meterix</strong>.
              Your registration is complete and your account is ready to track,
              meter, and monitor your AI applications in real time.
            </Text>
            <Text style={cardText}>
              Selected Plan: <span style={planBadge}>{planLabel}</span>
            </Text>
            <Section style={buttonSection}>
              <Button href="https://meterix.dev/dashboard" style={ctaButton}>
                Go to Dashboard →
              </Button>
            </Section>
          </Section>

          <Hr style={divider} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              Questions? Reply to this email or reach us at{" "}
              <Link href="mailto:support@meterix.dev" style={footerLink}>
                support@meterix.dev
              </Link>
            </Text>
            <Text style={footerCopy}>Meterix Platform • support@meterix.dev</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default WelcomeEmail;

// ---------------------------------------------------------------------------
// Styles – Meterix dark theme
// ---------------------------------------------------------------------------

const body: React.CSSProperties = {
  backgroundColor: "#050508",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  margin: "0",
  padding: "32px 0",
};

const container: React.CSSProperties = {
  maxWidth: "600px",
  margin: "0 auto",
  backgroundColor: "#09090b",
  borderRadius: "12px",
  border: "1px solid #27272a",
  overflow: "hidden",
};

const header: React.CSSProperties = {
  textAlign: "center",
  padding: "32px 32px 16px",
};

const logo: React.CSSProperties = {
  color: "#6366f1",
  fontSize: "28px",
  fontWeight: "800",
  margin: "0",
  letterSpacing: "-0.5px",
};

const tagline: React.CSSProperties = {
  color: "#71717a",
  fontSize: "13px",
  margin: "4px 0 0",
};

const divider: React.CSSProperties = {
  borderColor: "#27272a",
  margin: "0",
};

const card: React.CSSProperties = {
  backgroundColor: "#18181b",
  margin: "24px 24px",
  borderRadius: "10px",
  border: "1px solid #27272a",
  padding: "28px 28px",
};

const cardHeading: React.CSSProperties = {
  color: "#f4f4f5",
  fontSize: "20px",
  fontWeight: "700",
  margin: "0 0 16px",
};

const cardText: React.CSSProperties = {
  color: "#d4d4d8",
  fontSize: "14px",
  lineHeight: "1.7",
  margin: "0 0 12px",
};

const planBadge: React.CSSProperties = {
  color: "#818cf8",
  fontWeight: "700",
  backgroundColor: "#1e1b4b",
  padding: "2px 10px",
  borderRadius: "4px",
  fontSize: "12px",
  letterSpacing: "0.05em",
};

const buttonSection: React.CSSProperties = {
  textAlign: "center",
  marginTop: "28px",
};

const ctaButton: React.CSSProperties = {
  backgroundColor: "#4f46e5",
  color: "#ffffff",
  padding: "12px 28px",
  borderRadius: "8px",
  fontWeight: "600",
  fontSize: "14px",
  textDecoration: "none",
  display: "inline-block",
};

const footer: React.CSSProperties = {
  padding: "16px 32px 28px",
  textAlign: "center",
};

const footerText: React.CSSProperties = {
  color: "#52525b",
  fontSize: "12px",
  lineHeight: "1.6",
  margin: "0 0 4px",
};

const footerLink: React.CSSProperties = {
  color: "#818cf8",
  textDecoration: "none",
};

const footerCopy: React.CSSProperties = {
  color: "#3f3f46",
  fontSize: "11px",
  margin: "4px 0 0",
};
