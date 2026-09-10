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

export interface EnterpriseLeadInternalNotificationEmailProps {
  name: string;
  email: string;
  company: string;
  teamSize: string;
  useCase: string;
  submittedAt: string;
}

export function EnterpriseLeadInternalNotificationEmail({
  name,
  email,
  company,
  teamSize,
  useCase,
  submittedAt,
}: EnterpriseLeadInternalNotificationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>🔥 New Enterprise Lead: {company} — {name} ({teamSize} people)</Preview>
      <Body style={body}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Heading style={logo}>Meterix</Heading>
            <Text style={tagline}>Sales Pipeline Notification</Text>
          </Section>

          <Hr style={divider} />

          {/* Alert Banner */}
          <Section style={alertBanner}>
            <Heading as="h2" style={alertHeading}>
              🔥 New Enterprise Lead Submission
            </Heading>
            <Text style={alertSubtext}>
              A new enterprise inquiry was submitted via the Meterix website for{" "}
              <strong style={{ color: "#818cf8" }}>{company}</strong>.
            </Text>
          </Section>

          {/* Lead Details Card */}
          <Section style={card}>
            <Text style={summaryHeading}>Lead Details</Text>

            <Section style={statRow}>
              <Row>
                <Column style={statLabel}>Company</Column>
                <Column style={{ ...statValue, color: "#818cf8", fontWeight: "700" }}>
                  {company}
                </Column>
              </Row>
            </Section>
            <Hr style={rowDivider} />

            <Section style={statRow}>
              <Row>
                <Column style={statLabel}>Contact Name</Column>
                <Column style={statValue}>{name}</Column>
              </Row>
            </Section>
            <Hr style={rowDivider} />

            <Section style={statRow}>
              <Row>
                <Column style={statLabel}>Work Email</Column>
                <Column style={{ ...statValue, color: "#818cf8" }}>
                  <Link href={`mailto:${email}`} style={emailLink}>{email}</Link>
                </Column>
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
                <Column style={statLabel}>Submitted At</Column>
                <Column style={{ ...statValue, fontFamily: "monospace", fontSize: "12px", color: "#a1a1aa" }}>
                  {submittedAt}
                </Column>
              </Row>
            </Section>
          </Section>

          {/* Use Case Block */}
          <Section style={useCaseCard}>
            <Text style={summaryHeading}>Use Case &amp; Requirements</Text>
            <Text style={useCaseText}>{useCase}</Text>
          </Section>

          <Hr style={divider} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              Reply to{" "}
              <Link href={`mailto:${email}`} style={footerLink}>{email}</Link>{" "}
              to engage with this lead. This is an internal Meterix sales notification.
            </Text>
            <Text style={footerCopy}>Meterix Platform • support@meterix.dev</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default EnterpriseLeadInternalNotificationEmail;

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
  maxWidth: "620px",
  margin: "0 auto",
  backgroundColor: "#09090b",
  borderRadius: "12px",
  border: "1px solid #4f46e5",
  overflow: "hidden",
};

const header: React.CSSProperties = {
  textAlign: "center",
  padding: "28px 32px 12px",
};

const logo: React.CSSProperties = {
  color: "#6366f1",
  fontSize: "26px",
  fontWeight: "800",
  margin: "0",
  letterSpacing: "-0.5px",
};

const tagline: React.CSSProperties = {
  color: "#71717a",
  fontSize: "12px",
  margin: "2px 0 0",
};

const divider: React.CSSProperties = {
  borderColor: "#27272a",
  margin: "0",
};

const alertBanner: React.CSSProperties = {
  backgroundColor: "#0c0c1a",
  padding: "20px 32px",
};

const alertHeading: React.CSSProperties = {
  color: "#6366f1",
  fontSize: "18px",
  fontWeight: "700",
  margin: "0 0 8px",
};

const alertSubtext: React.CSSProperties = {
  color: "#a1a1aa",
  fontSize: "13px",
  lineHeight: "1.6",
  margin: "0",
};

const card: React.CSSProperties = {
  backgroundColor: "#18181b",
  margin: "20px 24px 12px",
  borderRadius: "10px",
  border: "1px solid #27272a",
  padding: "16px 24px 4px",
};

const summaryHeading: React.CSSProperties = {
  color: "#a1a1aa",
  fontSize: "11px",
  fontWeight: "600",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  margin: "0 0 8px",
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

const emailLink: React.CSSProperties = {
  color: "#818cf8",
  textDecoration: "none",
};

const rowDivider: React.CSSProperties = {
  borderColor: "#27272a",
  margin: "0",
};

const useCaseCard: React.CSSProperties = {
  backgroundColor: "#0f0f12",
  margin: "0 24px 20px",
  borderRadius: "10px",
  border: "1px solid #27272a",
  padding: "16px 24px",
};

const useCaseText: React.CSSProperties = {
  color: "#d4d4d8",
  fontSize: "13px",
  lineHeight: "1.7",
  margin: "0",
  whiteSpace: "pre-wrap",
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
