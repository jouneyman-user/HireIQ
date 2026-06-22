# 5/question-display-ui_1782149600

## Ticket Summary
Question display UI — render categorised questions with follow-ups and tips

## Milestone
M2 — Core Agent

## User Story
As a recruiter, I want to see the generated questions in a clean, readable layout so that I can use them directly during the interview.

## Acceptance Criteria
- [ ] Questions are displayed in collapsible category sections (Technical, Behavioural, Culture Fit)
- [ ] Each question card shows the main question, follow-up, and evaluation tip
- [ ] A loading skeleton is shown while generation is in progress
- [ ] Copy-to-clipboard button works on individual questions and the full set

## Implementation Plan

### Component Structure
```
src/components/QuestionDisplay/
├── QuestionDisplay.tsx          # Main container component
├── QuestionCategory.tsx         # Collapsible category section
├── QuestionCard.tsx             # Individual question card
├── QuestionSkeleton.tsx         # Loading skeleton component
├── CopyButton.tsx               # Copy-to-clipboard button
├── hooks/
│   └── useCopyToClipboard.ts    # Copy-to-clipboard hook
├── types.ts                     # TypeScript type definitions
└── index.ts                     # Barrel export
```

### Data Types
```typescript
interface Question {
  id: string;
  main: string;
  followUp: string;
  evaluationTip: string;
}

interface QuestionCategory {
  name: 'Technical' | 'Behavioural' | 'Culture Fit';
  questions: Question[];
}

interface QuestionDisplayProps {
  categories: QuestionCategory[];
  isLoading?: boolean;
}
```

### Component Specifications

#### QuestionDisplay (Main Container)
- Accepts `categories` array and optional `isLoading` boolean
- Renders a `QuestionSkeleton` when `isLoading` is true
- Renders a list of `QuestionCategory` components when data is available
- Wraps the full set with a global copy-to-clipboard button

#### QuestionCategory (Collapsible Section)
- Renders a collapsible/expandable section header with category name
- Default state: collapsed (user must expand to see questions)
- Contains a list of `QuestionCard` components
- Category header shows question count badge

#### QuestionCard
- Displays the main question text prominently
- Shows follow-up question in a secondary style
- Displays evaluation tip in a subtle/indented style
- Includes an individual copy-to-clipboard button per question
- Clean card layout with appropriate spacing and typography

#### QuestionSkeleton
- Shows skeleton placeholders for category sections
- Each skeleton mimics the shape of a question card
- Uses shimmer/blink animation pattern
- Displays 3 skeleton categories with 2-3 cards each

#### CopyButton
- Reusable button component with copy icon
- On click, copies associated text to clipboard
- Shows success feedback (checkmark or "Copied!" label)
- Resets to default state after 2 seconds
- Supports both individual question and full set copying

### State Management
- Collapsible categories: local state per category (`useState`)
- Copy feedback: local state per button (`useState`)
- Loading state: passed as prop from parent

### Styling Approach
- CSS Modules or styled-components (consistent with existing codebase)
- Responsive layout for mobile/desktop
- Accessible accordion pattern (ARIA attributes for collapsible sections)

## Testing Strategy
- Unit tests for each component
- Copy-to-clipboard functionality mock tests
- Skeleton loading state visual tests
- Accessibility audit for collapsible sections

## Dependencies
- No new external dependencies required (uses existing UI library)
- Clipboard API via browser native `navigator.clipboard`