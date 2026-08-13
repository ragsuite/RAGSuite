# Security Policy

## Supported versions

This policy applies to **RAGSuite Community Edition** in the public repository
[github.com/ragsuite/RAGSuite](https://github.com/ragsuite/RAGSuite).

| Version | Supported |
|---------|-----------|
| `1.0.x` (current Platform / CLI) | Yes |
| Older pre-`1.0.0` cuts | Best effort only |

Enterprise Edition source, signed offline keys, and the License Server are
**private** products of NITSAN. Do not open public issues about private
Enterprise or License Server internals; contact us privately (below).

## Reporting a vulnerability

**Please do not** file a public GitHub Issue for security vulnerabilities.

Report privately:

- Email: **[sales@ragsuite.de](mailto:sales@ragsuite.de)**  
  Prefer a clear subject such as `RAGSuite security report`
- Or use **GitHub Security Advisories** for this repository (preferred when
  available): Repository → Security → Advisories → Report a vulnerability

Include as much as you can:

- Affected component (API, admin UI, CLI `@ragsuite/ragsuite`, docs tooling)
- Version (`PLATFORM_VERSION` / `cli/package.json` / git commit)
- Steps to reproduce (PoC welcome privately — not in a public issue)
- Impact (auth bypass, data exposure, RCE, denial of service, etc.)
- Whether you are available for follow-up

We aim to acknowledge reports within **a few business days** and to keep you
informed of the status until a fix or decision is shared.

## Scope (Community Edition)

In scope (examples):

- Authentication / authorization flaws in the Community Platform
- Remote code execution or injection in API or install paths
- Secrets leakage from default configs or published packages
- Privilege escalation between Community roles/permissions
- Supply-chain issues in the published npm package `@ragsuite/ragsuite`

Out of scope (examples):

- Social engineering or physical attacks
- Denial of service that requires unrealistic traffic without a concrete bug
- Issues only in third-party dependencies with no practical RAGSuite exploit path
  (please report upstream when appropriate; we still welcome a heads-up)
- Missing Enterprise-only features (SSO, org RBAC, etc.) — those are not part of
  this public Community repository’s attack surface for open contribution

## Safe harbor

We will not pursue legal action against researchers who:

- Report in good faith through the private channels above
- Avoid privacy violations, data destruction, and service disruption beyond what
  is needed to demonstrate the issue
- Give us a reasonable time to address the issue before public disclosure

## Coordinated disclosure

Please allow time for a fix (or mitigation) before public disclosure. We will
credit researchers who wish to be named, unless you ask to remain anonymous.

## Non-security contact

Product, sales, and Enterprise licensing: [sales@ragsuite.de](mailto:sales@ragsuite.de) · [www.ragsuite.de](https://www.ragsuite.de)  
Owner: [NITSAN](https://nitsan.ai/)

## License

Community Edition remains under the [Apache License, Version 2.0](./LICENSE).
See [NOTICE](./NOTICE) for attribution and Community vs Enterprise scope.
