import * as React from "react";
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
  Link,
  Row,
  Column,
} from "react-email";

export interface EnterpriseLeadConfirmationEmailProps {
  name: string;
  company: string;
  email: string;
  teamSize: string;
  useCase: string;
}

export function EnterpriseLeadConfirmationEmail({
  name,
  company,
  email,
  teamSize,
  useCase,
}: EnterpriseLeadConfirmationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        Thanks for reaching out, {name}! We've received your enterprise inquiry for {company}.
      </Preview>
      <Body style={body}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Heading style={logo}>Meterix</Heading>
            <Text style={tagline}>Developer AI Metering &amp; Telemetry Platform</Text>
          </Section>

          <Hr style={divider} />

          {/* Main Card */}
          <Section style={card}>
            <Heading as="h2" style={cardHeading}>
              Hi {name}, we've received your request! 👋
            </Heading>
            <Text style={cardText}>
              Thank you for reaching out to <strong>Meterix</strong>. We&apos;ve
              received your enterprise inquiry for <strong>{company}</strong> and
              we&apos;re excited to learn more about your use case.
            </Text>
            <Text style={cardText}>
              Our enterprise solutions team is reviewing your requirements and
              will reach out within{" "}
              <strong style={{ color: "#f4f4f5" }}>1 business day</strong> to
              schedule a tailored demo and discuss custom architecture options.
            </Text>
          </Section>

          {/* Submission Summary */}
          <Section style={summaryCard}>
            <Text style={summaryHeading}>Your Submission Summary</Text>

            <Section style={statRow}>
              <Row>
                <Column style={statLabel}>Company</Column>
                <Column style={statValue}>{company}</Column>
              </Row>
            </Section>
            <Hr style={rowDivider} />
            <Section style={statRow}>
              <Row>
                <Column style={statLabel}>Team Size</Column>
                <Column style={statValue}>{teamSize} people</Column>
              </Row>
            </Section>
            <Hr style={rowDivider} />
            <Section style={statRow}>
              <Row>
                <Column style={statLabel}>Contact Email</Column>
                <Column style={{ ...statValue, color: "#818cf8" }}>{email}</Column>
              </Row>
            </Section>
            <Hr style={rowDivider} />
            <Section style={statRow}>
              <Row>
                <Column style={{ ...statLabel, verticalAlign: "top" }}>Use Case</Column>
                <Column style={{ ...statValue, whiteSpace: "pre-wrap" }}>{useCase}</Column>
              </Row>
            </Section>
          </Section>

          <Hr style={divider} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              If you have immediate questions, reply directly to this email or
              contact us at{" "}
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

export default EnterpriseLeadConfirmationEmail;

// ---------------------------------------------------------------------------
// Styles
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
  margin: "24px 24px 12px",
  borderRadius: "10px",
  border: "1px solid #27272a",
  padding: "28px 28px",
};

const cardHeading: React.CSSProperties = {
  color: "#f4f4f5",
  fontSize: "18px",
  fontWeight: "700",
  margin: "0 0 14px",
};

const cardText: React.CSSProperties = {
  color: "#d4d4d8",
  fontSize: "14px",
  lineHeight: "1.7",
  margin: "0 0 12px",
};

const summaryCard: React.CSSProperties = {
  backgroundColor: "#0f0f12",
  margin: "0 24px 24px",
  borderRadius: "10px",
  border: "1px solid #27272a",
  padding: "20px 24px",
};

const summaryHeading: React.CSSProperties = {
  color: "#a1a1aa",
  fontSize: "12px",
  fontWeight: "600",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  margin: "0 0 12px",
};

const statRow: React.CSSProperties = {
  padding: "10px 0",
};

const statLabel: React.CSSProperties = {
  color: "#71717a",
  fontSize: "13px",
  width: "40%",
};

const statValue: React.CSSProperties = {
  color: "#d4d4d8",
  fontSize: "13px",
  fontWeight: "500",
};

const rowDivider: React.CSSProperties = {
  borderColor: "#1f1f23",
  margin: "0",
};

const footer: React.CSSProperties = {
  padding: "16px 32px 28px",
  textAlign: "center",
};

const footerText: React.CSSProperties = {
  color: "#52525b",
  fontSize: "12px",
  lineHeight: "1.6",
  margin: "0 0 6px",
};

const footerLink: React.CSSProperties = {
  color: "#818cf8",
  textDecoration: "none",
};

const footerCopy: React.CSSProperties = {
  color: "#3f3f46",
  fontSize: "11px",
  margin: "0",
};
