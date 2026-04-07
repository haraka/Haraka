# Security Policy

## Supported Versions

Security fixes are applied to the **current release** only. We encourage all users to run the latest version.

| Version        | Supported |
| -------------- | --------- |
| 3.1.x (latest) | ✅        |
| < 3.1          | ❌        |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Use [GitHub Private Vulnerability Reporting](https://github.com/haraka/Haraka/security/advisories/new) to disclose security issues confidentially. This allows the maintainers to assess and patch the issue before public disclosure.

Include as much of the following as possible:

- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof-of-concept
- Affected version(s)
- Any suggested mitigations or patches

## Response Process

1. **Acknowledgement** — We aim to acknowledge reports within **72 hours**.
2. **Assessment** — We will confirm the issue, determine severity, and identify affected versions.
3. **Fix & Release** — A patch release will be prepared and coordinated with the reporter.
4. **Disclosure** — A GitHub Security Advisory (and CVE if applicable) will be published after the fix is available.

We follow [coordinated vulnerability disclosure](https://vuls.cert.org/confluence/display/CVD). Reporters are credited in the advisory unless they prefer otherwise.

## Security Advisories

Published advisories are listed at:
**https://github.com/haraka/Haraka/security/advisories**

## Scope

Haraka is an SMTP server. Security issues of particular concern include:

- Remote code execution
- Denial of service (e.g. resource exhaustion, crashes)
- Authentication or access control bypass
- Email header injection or SMTP smuggling
- Information disclosure via logs or error responses
- Plugin sandbox escapes

Issues in third-party plugins maintained outside this repository should be reported to their respective maintainers.
