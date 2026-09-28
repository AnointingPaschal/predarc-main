# Implementation Plan: DecentWork — Onchain Freelance Platform

## Summary
A decentralized freelance marketplace on Arc Testnet where clients post jobs, fund USDC escrow, and AI validates deliverables before payment releases automatically. Built for any freelancer or client globally, with a 2% platform fee per completed job.

## Architecture
- **Blockchain:** Arc Testnet — USDC as gas means freelancers hold one asset, stable fees make small job economics viable, sub-second finality for instant payment release
- **Contract:** `FreelanceEscrow.sol` — job creation, USDC escrow deposit, milestone management, deliverable submission, AI-validated release, dispute initiation, platform fee collection, and refund logic
- **Frontend:** React + Tailwind — job board, freelancer/client dashboards, job detail pages, profile cards, dispute UI, earnings tracker
- **Wallet:** ConnectKit (injected wallet) — standard browser wallet connection

## Files to Create/Modify

1. `contracts/FreelanceEscrow.sol` — core escrow contract: job lifecycle, USDC deposit/release, milestones, disputes, 2% fee
2. `src/App.tsx` — root layout with routing and wallet provider
3. `src/pages/JobBoard.tsx` — browsable job listings with filters (category, budget, status)
4. `src/pages/PostJob.tsx` — client form: title, description, USDC budget, milestones, AI criteria
5. `src/pages/JobDetail.tsx` — full job view, apply button for freelancers, deliverable submission, status timeline
6. `src/pages/ClientDashboard.tsx` — client's active jobs, pending approvals, escrow balances, spending history
7. `src/pages/FreelancerDashboard.tsx` — active jobs, submitted deliverables, earnings, dispute history
8. `src/pages/Profile.tsx` — public profile: bio, skills, completed jobs, ratings
9. `src/components/JobCard.tsx` — reusable job listing card with budget, category, and status badge
10. `src/components/EscrowStatus.tsx` — visual escrow state machine (funded → in progress → submitted → released/disputed)
11. `src/components/MilestoneTracker.tsx` — per-milestone progress with individual USDC amounts and release buttons
12. `src/components/DisputeModal.tsx` — raise or respond to a dispute with on-chain evidence submission
13. `src/components/AIValidationBadge.tsx` — shows AI validation result and criteria match score
14. `src/hooks/useEscrow.ts` — wagmi hooks wrapping all contract interactions (create job, deposit, submit, release, dispute)
15. `src/hooks/useJobs.ts` — read contract state: job listings, job details, user's jobs
16. `src/lib/aiValidation.ts` — client-side AI call to check deliverable against job criteria, returns pass/fail + score
17. `src/lib/contractAddresses.ts` — deployed contract address and ABI imports
18. `src/onchain-facts.ts` — already exists, used for USDC address and Arc Testnet chain config

## Build Sequence

1. **Write and deploy `FreelanceEscrow.sol`** — job struct, USDC escrow logic, milestone splits, release/refund/dispute functions, 2% fee to platform address, events for all state transitions. Audit at `balanced` preset, deploy to Arc Testnet.
2. **Wire contract hooks** — `useEscrow.ts` and `useJobs.ts` using wagmi `useReadContract` / `useWriteContract` against the deployed address. Import ABI from build artifacts.
3. **Build job board and post-job flow** — `JobBoard.tsx` reads all open jobs from contract events, `PostJob.tsx` lets clients set budget + milestones + AI criteria and calls `createJob` + USDC `approve` + `deposit`.
4. **Build job detail and application flow** — `JobDetail.tsx` shows full job, freelancer applies on-chain, client selects and activates. `EscrowStatus.tsx` and `MilestoneTracker.tsx` show live state.
5. **Build deliverable submission and AI validation** — freelancer submits deliverable hash + URL, `aiValidation.ts` calls AI API against stored criteria, `AIValidationBadge.tsx` shows result. Auto-release if AI passes; flag for manual review if not.
6. **Build dispute module** — `DisputeModal.tsx` lets either party raise a dispute with evidence. Contract freezes escrow and emits event. Arbiter address (initially platform-controlled) can rule in favour of either party.
7. **Build dashboards and profiles** — `ClientDashboard.tsx`, `FreelancerDashboard.tsx`, and `Profile.tsx` reading from contract events and on-chain state.
8. **Polish and connect all pages** — routing in `App.tsx`, wallet connection, chain switching guard, empty states, loading skeletons, mobile responsive layout.

## Done When
- [ ] Client can post a job with USDC budget and AI validation criteria
- [ ] USDC is locked in the escrow contract on Arc Testnet and visible on-chain
- [ ] Freelancer can browse job board, apply, and be selected
- [ ] Freelancer can submit a deliverable URL/hash
- [ ] AI validates deliverable against criteria and triggers automatic release
- [ ] Client can manually approve or raise a dispute
- [ ] USDC releases instantly to freelancer's wallet (minus 2% fee) on approval
- [ ] Both dashboards show live job status and earnings
- [ ] Platform fee is collected to a designated address per completed job
- [ ] App runs end-to-end on Arc Testnet with no ETH required
