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

export interface StaleModel {
  modelName: string;
  provider: string;
  inputRate: string;
  outputRate: string;
  lastVerifiedAt: string;
}

export interface StaleModelAlertEmailProps {
  staleCount: number;
  models: StaleModel[];
}

export function StaleModelAlertEmail({ staleCount, models }: StaleModelAlertEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{`⚠️ [Meterix Admin] ${staleCount} model pricing record${staleCount !== 1 ? "s" : ""} require manual verification`}</Preview>
      <Body style={body}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Heading style={logo}>Meterix</Heading>
            <Text style={tagline}>Automated Admin Verification System</Text>
          </Section>

          <Hr style={divider} />

          {/* Alert Banner */}
          <Section style={alertBanner}>
            <Heading as="h2" style={alertHeading}>
              ⚠️ Stale Model Pricing Alert
            </Heading>
            <Text style={alertSubtext}>
              The following <strong>{staleCount}</strong> active model pricing
              record{staleCount !== 1 ? "s" : ""} have not been verified within
              the last <strong>30 days</strong> and require manual verification.
            </Text>
          </Section>

          {/* Models Table */}
          <Section style={tableSection}>
            {/* Table Header */}
            <Section style={tableHeader}>
              <Row>
                <Column style={thCell}>Model Name</Column>
                <Column style={thCell}>Provider</Column>
                <Column style={thCell}>Rate (In/Out)</Column>
                <Column style={thCell}>Last Verified</Column>
              </Row>
            </Section>
            <Hr style={rowDivider} />

            {/* Table Rows */}
            {models.map((model, i) => (
              <React.Fragment key={i}>
                <Section style={tableRow}>
                  <Row>
                    <Column style={tdModel}>{model.modelName}</Column>
                    <Column style={tdProvider}>{model.provider}</Column>
                    <Column style={tdRate}>
                      {model.inputRate} / {model.outputRate}
                    </Column>
                    <Column style={tdVerified}>{model.lastVerifiedAt}</Column>
                  </Row>
                </Section>
                {i < models.length - 1 && <Hr style={rowDivider} />}
              </React.Fragment>
            ))}
          </Section>

          <Hr style={divider} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              Please review provider documentation and update the{" "}
              <code style={codeStyle}>model_pricing</code> table in Supabase.
            </Text>
            <Text style={footerCopy}>
              Meterix Engine •{" "}
              <Link href="mailto:support@meterix.dev" style={footerLink}>
                support@meterix.dev
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default StaleModelAlertEmail;

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
  maxWidth: "660px",
  margin: "0 auto",
  backgroundColor: "#09090b",
  borderRadius: "12px",
  border: "1px solid #f59e0b",
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
  backgroundColor: "#130f00",
  padding: "20px 32px",
};

const alertHeading: React.CSSProperties = {
  color: "#f59e0b",
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

const tableSection: React.CSSProperties = {
  margin: "20px 24px",
  backgroundColor: "#18181b",
  borderRadius: "10px",
  border: "1px solid #27272a",
  overflow: "hidden",
  padding: "0 16px",
};

const tableHeader: React.CSSProperties = {
  padding: "12px 0",
};

const thCell: React.CSSProperties = {
  color: "#71717a",
  fontSize: "11px",
  fontWeight: "600",
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  padding: "0 8px",
};

const tableRow: React.CSSProperties = {
  padding: "12px 0",
};

const rowDivider: React.CSSProperties = {
  borderColor: "#27272a",
  margin: "0",
};

const tdModel: React.CSSProperties = {
  color: "#f4f4f5",
  fontSize: "13px",
  fontWeight: "600",
  padding: "0 8px",
};

const tdProvider: React.CSSProperties = {
  color: "#a1a1aa",
  fontSize: "13px",
  padding: "0 8px",
};

const tdRate: React.CSSProperties = {
  color: "#818cf8",
  fontSize: "12px",
  fontFamily: "monospace",
  padding: "0 8px",
};

const tdVerified: React.CSSProperties = {
  color: "#ef4444",
  fontSize: "12px",
  fontWeight: "500",
  padding: "0 8px",
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

const codeStyle: React.CSSProperties = {
  fontFamily: "monospace",
  backgroundColor: "#1c1c1c",
  padding: "1px 5px",
  borderRadius: "3px",
  fontSize: "11px",
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
