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

export interface TeamInviteEmailProps {
  inviterName: string;
  inviteeEmail: string;
  role: string;
  inviteLink: string;
  projectName?: string;
}

export function TeamInviteEmail({
  inviterName,
  inviteeEmail,
  role,
  inviteLink,
  projectName,
}: TeamInviteEmailProps) {
  const roleLabel = role.toUpperCase();
  const projectLabel = projectName ? `the ${projectName} project` : "a project";

  return (
    <Html>
      <Head />
      <Preview>
        {inviterName} invited you to join {projectLabel} on Meterix as a {roleLabel}.
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
              You&apos;re Invited! 🎉
            </Heading>
            <Text style={cardText}>
              <strong>{inviterName}</strong> has invited you to collaborate on{" "}
              <strong>Meterix</strong> as a{" "}
              <span style={roleBadge}>{roleLabel}</span> on {projectLabel}.
            </Text>
            <Text style={cardText}>
              Click the button below to accept your invitation and get started.
            </Text>

            {/* CTA */}
            <Section style={buttonSection}>
              <Button href={inviteLink} style={ctaButton}>
                Accept Invitation →
              </Button>
            </Section>

            {/* Fallback Link */}
            <Text style={fallbackText}>
              If the button doesn&apos;t work, copy this link into your browser:
            </Text>
            <Text style={fallbackLink}>
              <Link href={inviteLink} style={linkStyle}>
                {inviteLink}
              </Link>
            </Text>
          </Section>

          <Hr style={divider} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              This invitation link will expire in{" "}
              <strong style={{ color: "#a1a1aa" }}>7 days</strong>. If you did
              not expect this invitation, you can safely ignore this email.
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

export default TeamInviteEmail;

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
  margin: "0 0 14px",
};

const roleBadge: React.CSSProperties = {
  color: "#818cf8",
  fontWeight: "700",
  backgroundColor: "#1e1b4b",
  padding: "2px 10px",
  borderRadius: "4px",
  fontSize: "12px",
  letterSpacing: "0.08em",
};

const buttonSection: React.CSSProperties = {
  textAlign: "center",
  margin: "24px 0 20px",
};

const ctaButton: React.CSSProperties = {
  backgroundColor: "#4f46e5",
  color: "#ffffff",
  padding: "13px 32px",
  borderRadius: "8px",
  fontWeight: "600",
  fontSize: "14px",
  textDecoration: "none",
  display: "inline-block",
};

const fallbackText: React.CSSProperties = {
  color: "#71717a",
  fontSize: "12px",
  margin: "16px 0 4px",
};

const fallbackLink: React.CSSProperties = {
  wordBreak: "break-all",
  margin: "0",
};

const linkStyle: React.CSSProperties = {
  color: "#818cf8",
  fontSize: "12px",
  textDecoration: "none",
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
