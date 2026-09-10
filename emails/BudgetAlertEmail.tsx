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
  Row,
  Column,
  Section,
  Text,
  Link,
} from "react-email";

export interface BudgetAlertEmailProps {
  projectName: string;
  currentSpend: number;
  budgetCap: number;
  percentage: number;
  actionType?: string;
  actionDescription?: string;
  isCritical?: boolean;
}

export function BudgetAlertEmail({
  projectName,
  currentSpend,
  budgetCap,
  percentage,
  actionType,
  actionDescription = "Budget notice logged",
  isCritical = false,
}: BudgetAlertEmailProps) {
  const formattedSpend = `$${Number(currentSpend).toFixed(4)}`;
  const formattedCap = `$${Number(budgetCap).toFixed(2)}`;
  const isActionTaken =
    isCritical ||
    actionType === "critical" ||
    actionType === "block_new_logs" ||
    actionType === "revoke_key";

  const subject = isActionTaken
    ? `🚨 Budget Exceeded — Action Taken`
    : `⚠️ Budget Cap Warning`;

  const accentColor = isActionTaken ? "#ef4444" : "#f59e0b";
  const borderColor = isActionTaken ? "#ef4444" : "#f59e0b";
  const spendColor = isActionTaken ? "#ef4444" : "#fbbf24";
  const previewText = isActionTaken
    ? `🚨 [Meterix] Action Taken – Budget Exceeded for ${projectName}`
    : `⚠️ [Meterix] Budget Cap Warning – ${projectName} has reached ${percentage}% of its limit`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={body}>
        <Container style={{ ...container, border: `1px solid ${borderColor}` }}>
          {/* Header */}
          <Section style={header}>
            <Heading style={logo}>Meterix</Heading>
            <Text style={tagline}>Telemetry Infrastructure</Text>
          </Section>

          <Hr style={divider} />

          {/* Alert Banner */}
          <Section style={{ ...alertBanner, backgroundColor: isActionTaken ? "#1c0a0a" : "#1c1205" }}>
            <Heading as="h2" style={{ ...alertHeading, color: accentColor }}>
              {isActionTaken ? "🚨 Budget Exceeded — Action Taken" : "⚠️ Budget Cap Warning"}
            </Heading>
            <Text style={alertSubtext}>
              {isActionTaken
                ? `The allocated budget for ${projectName} has been exceeded and enforcement has been applied.`
                : `Your project ${projectName} has reached ${percentage}% of its configured budget limit.`}
            </Text>
          </Section>

          {/* Stats Card */}
          <Section style={card}>
            <Text style={sectionLabel}>
              Project: <span style={projectNameStyle}>{projectName}</span>
            </Text>

            {/* Row: Current Spend */}
            <Section style={statRow}>
              <Row>
                <Column style={statLabel}>Current Spend</Column>
                <Column style={{ ...statValue, color: spendColor }}>
                  {formattedSpend} USD ({percentage}%)
                </Column>
              </Row>
            </Section>
            <Hr style={rowDivider} />

            {/* Row: Budget Limit */}
            <Section style={statRow}>
              <Row>
                <Column style={statLabel}>Budget Limit</Column>
                <Column style={statValue}>{formattedCap} USD</Column>
              </Row>
            </Section>

            {/* Enforced Action – only when critical */}
            {isActionTaken && (
              <>
                <Hr style={rowDivider} />
                <Section style={statRow}>
                  <Row>
                    <Column style={statLabel}>Enforced Action</Column>
                    <Column style={{ ...statValue, color: "#f87171" }}>
                      {actionDescription}
                    </Column>
                  </Row>
                </Section>
              </>
            )}
          </Section>

          {/* CTA */}
          <Section style={buttonSection}>
            <Button href="https://meterix.dev/dashboard" style={ctaButton}>
              {isActionTaken ? "Review & Increase Budget →" : "Manage Budget Cap →"}
            </Button>
          </Section>

          <Hr style={divider} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              {isActionTaken
                ? "To resume telemetry ingestion or increase your budget cap, visit your Meterix Dashboard."
                : "Review and adjust budget limits in your Meterix Dashboard to prevent automatic enforcement."}
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

export default BudgetAlertEmail;

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
  padding: "20px 32px",
  margin: "0",
};

const alertHeading: React.CSSProperties = {
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
  margin: "20px 24px",
  borderRadius: "10px",
  border: "1px solid #27272a",
  padding: "20px 24px",
};

const sectionLabel: React.CSSProperties = {
  color: "#a1a1aa",
  fontSize: "13px",
  margin: "0 0 16px",
};

const projectNameStyle: React.CSSProperties = {
  color: "#6366f1",
  fontWeight: "700",
};

const statRow: React.CSSProperties = {
  padding: "10px 0",
};

const statLabel: React.CSSProperties = {
  color: "#71717a",
  fontSize: "13px",
  width: "50%",
};

const statValue: React.CSSProperties = {
  color: "#f4f4f5",
  fontSize: "13px",
  fontWeight: "600",
  textAlign: "right",
};

const rowDivider: React.CSSProperties = {
  borderColor: "#27272a",
  margin: "0",
};

const buttonSection: React.CSSProperties = {
  textAlign: "center",
  padding: "8px 24px 20px",
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
