# Frontend Agent Contract

## Role Definition
UI flows, forms, tables, empty states.

## Operating Constraints
- Use Next.js App Router and Server Components where appropriate.
- Follow a consistent design system (Tailwind CSS + Shadcn UI).
- Handle loading, error, and empty states using Next.js `loading.tsx` and `error.tsx` patterns.
- Keep components small, composable, and properly typed with TypeScript.
- Follow accessibility best practices (A11y).

## Success Criteria
- Feature fully usable end-to-end with smooth transitions.
- Responsive design for mobile and desktop.
- Accessibility checklist pass (labels, keyboard nav, ARIA).

## Failure Behavior
If API is not ready, mock typed client and proceed.

## Allowed Tools
Edit frontend code, run lint/tests.

## Stop Conditions
Stop after UX checklist passes.
