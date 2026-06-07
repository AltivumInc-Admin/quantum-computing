# Quantum Computing Workspace (Amazon Braket)

## About This Project

This is a quantum computing learning and experimentation workspace using Amazon Braket.
It follows a progressive learning path from circuit fundamentals (01-foundations) through
production hybrid quantum-classical workloads (06-hybrid-jobs), with focused tracks on
Quantum Machine Learning and Quantum Chemistry.

## Development Guidelines

- Always use the local simulator (`LocalSimulator()`) for development and testing
- Only suggest running on real QPU hardware if the user explicitly requests it
- When QPU usage is requested, always include a cost estimate before execution
- Use PennyLane for variational and hybrid quantum-classical algorithms
- Follow the numbered directory progression when suggesting learning next steps
- Reference AWS Braket documentation for device-specific constraints

## Structure

- `00-prereqs/` through `06-hybrid-jobs/` — Progressive learning sections
- `lib/` — Shared Python library (circuits, utils, hardware abstraction)
- `infra/` — CloudFormation templates and setup scripts
- `tests/` — Pytest suite for lib/ (runs on local simulator only)

## Key Commands

- `make setup` — Install all dependencies and validate AWS credentials
- `make lab` — Launch JupyterLab
- `make test` — Run test suite
- `make devices` — Show available Braket devices and their status
- `make cost` — Check current month's Braket spend

## Cost Awareness

Amazon Braket charges per-task and per-shot on real hardware. Always:
1. Prototype on local simulator first
2. Test on managed simulator (SV1) for larger circuits
3. Only move to QPU when the algorithm is validated
4. Check `make cost` regularly

Approximate costs (as of 2025):
- Local simulator: Free
- SV1/DM1/TN1: $0.075-$0.275 per minute
- IonQ: $0.01 per shot + $0.30 per task
- IQM: $0.00145 per shot + $0.30 per task
- QuEra: $0.01 per shot + $0.30 per task

## Dependencies

Managed via pyproject.toml. Key packages:
- `amazon-braket-sdk` — Core SDK
- `pennylane` + `pennylane-braket` — Variational algorithms
- `openfermion` + `openfermionpyscf` — Quantum chemistry

## Web App (`web/`)

### Stack
- Next.js 16 + React 19, static export via `output: "export"`
- Tailwind CSS v4 (PostCSS plugin) — uses `@theme inline` for compile-time tokens
- Fonts: Plus Jakarta Sans (body) + Instrument Serif (display) via `next/font/google`
- Dark mode: `next-themes` with `@variant dark (&:where(.dark, .dark *));` in globals.css
- Deployment: AWS Amplify (auto-deploys from git push, `amplify.yml` at repo root)

### Key Patterns
- `@theme inline` values compile statically — they cannot be overridden at runtime via CSS classes. Use standard Tailwind `dark:` utilities for theme-dependent values.
- Custom animation keyframes live in `globals.css`; utility classes (`.animate-*`) reference them. All animations must have `prefers-reduced-motion` coverage.
- CSS utilities `.bg-atmosphere`, `.bg-grid-dots` provide layered background depth.
- `OrbitalDecoration` component is purely decorative SVG — hidden below `lg:` breakpoint, `aria-hidden="true"`.

### Commands
- `npm run dev` — Start dev server (port 3000)
- `npm test` — Run Jest test suite (308 tests)
- `npm run build` — Static export (11 pages)
- `npm run lint` — ESLint check
