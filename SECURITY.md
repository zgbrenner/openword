# Security policy

## Supported versions

Security fixes are applied to the current default branch and the latest published release. Older development snapshots are not maintained separately.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability.

Use GitHub's private vulnerability reporting flow from the repository Security tab. Include:

- The affected version or commit
- Reproduction steps or a minimal malicious document
- Expected and observed behavior
- The security impact
- Whether opening the file triggers network, filesystem, script, or privilege-sensitive behavior

Please remove personal or confidential content from proof-of-concept documents.

## Security boundaries

OpenWord treats every imported document as untrusted.

Current defenses include:

- Sanitized HTML and Markdown-derived HTML
- DOCX conversion with external file access disabled
- Remote images removed during import
- Native `.openword` content normalized through node, mark, URL, image, and style allowlists
- Unsafe hyperlink schemes removed
- Embedded images restricted to supported local data-image formats
- A 50 MB DOCX import safety limit
- Tauri content security policy and capability restrictions
- No remote scripts, fonts, telemetry, or required cloud service

These controls reduce risk but do not make arbitrary document parsing risk-free. Format libraries and the operating-system webview remain part of the trusted computing base.

## Out of scope

The following reports generally do not qualify as vulnerabilities by themselves:

- Compatibility loss that is already surfaced as a warning
- Malicious content that remains inert text and cannot execute or leave the device
- Denial of service requiring unusually large files above documented limits
- Attacks that require the user to replace the application binary or modify its source code
