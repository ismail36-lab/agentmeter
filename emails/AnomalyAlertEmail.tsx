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

export interface AnomalyAlertEmailProps {
  projectName: string;
  model: string;
  estimatedCost: number;
  spikeThresholdUSD?: number;
  timestamp: string;
  reason?: string;
}

export function AnomalyAlertEmail({
  projectName,
  model,
  estimatedCost,
  spikeThresholdUSD,
  timestamp,
  reason = "Request cost exceeded threshold / error spike detected",
}: AnomalyAlertEmailProps) {
  const formattedCost = `$${Number(estimatedCost).toFixed(4)}`;
  const formattedThreshold =
    spikeThresholdUSD !== undefined
      ? `$${Number(spikeThresholdUSD).toFixed(4)}`
      : "N/A";

  return (
    <Html>
      <Head />
      <Preview>
        ⚡ [Meterix] Unusual Cost Spike Detected in {projectName} — {formattedCost} USD
      </Preview>
      <Body style={body}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Heading style={logo}>Meterix</Heading>
            <Text style={tagline}>Anomaly Monitoring</Text>
          </Section>

          <Hr style={divider} />

          {/* Alert Banner */}
          <Section style={alertBanner}>
            <Heading as="h2" style={alertHeading}>
              ⚡ Unusual Cost Spike Detected
            </Heading>
            <Text style={alertSubtext}>
              An anomalous cost spike was detected in your telemetry request
              logs for project <strong style={{ color: "#818cf8" }}>{projectName}</strong>.
            </Text>
          </Section>

          {/* Stats Card */}
          <Section style={card}>
            <Section style={statRow}>
              <Row>
                <Column style={statLabel}>Project Name</Column>
                <Column style={{ ...statValue, color: "#818cf8" }}>{projectName}</Column>
              </Row>
            </Section>
            <Hr style={rowDivider} />

            <Section style={statRow}>
              <Row>
                <Column style={statLabel}>Timestamp</Column>
                <Column style={{ ...statValue, fontFamily: "monospace", fontSize: "12px" }}>
                  {timestamp}
                </Column>
              </Row>
            </Section>
            <Hr style={rowDivider} />

            <Section style={statRow}>
              <Row>
                <Column style={statLabel}>Model Used</Column>
                <Column style={{ ...statValue, color: "#818cf8" }}>{model}</Column>
              </Row>
            </Section>
            <Hr style={rowDivider} />

            <Section style={statRow}>
              <Row>
                <Column style={statLabel}>Estimated Cost</Column>
                <Column style={{ ...statValue, color: "#fbbf24", fontWeight: "700" }}>
                  {formattedCost} USD
                </Column>
              </Row>
            </Section>
            <Hr style={rowDivider} />

            <Section style={statRow}>
              <Row>
                <Column style={statLabel}>Spike Threshold</Column>
                <Column style={statValue}>{formattedThreshold}</Column>
              </Row>
            </Section>
            <Hr style={rowDivider} />

            <Section style={statRow}>
              <Row>
                <Column style={{ ...statLabel, verticalAlign: "top" }}>Trigger Reason</Column>
                <Column style={{ ...statValue, color: "#a1a1aa" }}>{reason}</Column>
              </Row>
            </Section>
          </Section>

          <Hr style={divider} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              You are receiving this alert because email notifications are
              enabled in your alert_preferences. You can adjust preferences in
              your{" "}
              <Link href="https://meterix.dev/dashboard/settings" style={footerLink}>
                Meterix Dashboard
              </Link>
              .
            </Text>
            <Text style={footerCopy}>
              Meterix Platform •{" "}
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

export default AnomalyAlertEmail;

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
  border: "1px solid #818cf8",
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
  backgroundColor: "#0d0b1c",
  padding: "20px 32px",
};

const alertHeading: React.CSSProperties = {
  color: "#818cf8",
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
  margin: "20px 24px 20px",
  borderRadius: "10px",
  border: "1px solid #27272a",
  padding: "4px 24px",
};

const statRow: React.CSSProperties = {
  padding: "10px 0",
};

const statLabel: React.CSSProperties = {
  color: "#71717a",
  fontSize: "13px",
  width: "45%",
};

const statValue: React.CSSProperties = {
  color: "#d4d4d8",
  fontSize: "13px",
  fontWeight: "600",
};

const rowDivider: React.CSSProperties = {
  borderColor: "#27272a",
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
