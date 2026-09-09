// Guided-tour definition (pure data — no JSX, no DOM) so it can be unit-tested
// and reused by the tour engine.

export type TourSection =
  | 'dashboard'
  | 'details'
  | 'resources'
  | 'designs'
  | 'bom'
  | 'quotation'
  | 'pos'
  | 'finance'
  | 'workflow';

export interface TourStep {
  id: string;
  section: TourSection;
  /** When inside Designs: which sub-tool to activate (list/studio/cad/audit/nesting). */
  tool?: 'list' | 'studio' | 'cad' | 'audit' | 'nesting';
  /** CSS selector of the element to spotlight (may be missing -> step skipped). */
  target: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
  /** Only shown once a project is actually open. */
  requiresProject?: boolean;
  /** Never shown — kept in the definition only to document a not-yet-shipped area. */
  skipAlways?: boolean;
  /** Always shown, never targeted (final workflow step). */
  final?: boolean;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'dashboard',
    section: 'dashboard',
    target: '[data-onboard="nav-dashboard"]',
    title: 'Your Dashboard',
    paragraphs: [
      'The Dashboard is your project home. From here you can create new projects, open existing projects, search projects, and see real project information.',
    ],
    bullets: [
      'New Project — start a fresh aluminium project',
      'Open Project — resume a saved project',
      'Project search, project overview and recent projects',
      'Only real saved project data is ever shown',
    ],
  },
  {
    id: 'details',
    section: 'details',
    target: '[data-onboard="nav-details"]',
    title: 'Project Details',
    paragraphs: [
      'Start every project by entering the client, site and project information.',
    ],
    bullets: [
      'Project Name and Project Number in the format FA-YYYY-NNN',
      'Client name and contact information',
      'Site address, contractor, dates and assigned staff',
      'Description and notes',
      'Project numbers are generated for you and never duplicated',
    ],
  },
  {
    id: 'resources',
    section: 'resources',
    target: '', // intentionally absent — the Resources section is a later phase
    title: 'Project Resources',
    paragraphs: [
      'Site photos, measurements and reference files are kept together in the Resources section when it ships.',
    ],
    skipAlways: true,
  },
  {
    id: 'designs',
    section: 'designs',
    target: '[data-onboard="nav-designs"]',
    title: 'Design Your Openings',
    paragraphs: [
      'This is where you create and manage the actual aluminium door and window designs.',
    ],
    bullets: [
      'Opening List registers every door and window',
      'Each opening has an ID such as D-01, D-02, W-01',
      'Dimensions, frame/sash configuration, glass, profiles, hardware and finish',
      'An opening is the core design unit of the whole project',
    ],
  },
  {
    id: 'opening-list',
    section: 'designs',
    tool: 'list',
    target: '[data-onboard="tool-list"]',
    title: 'Opening List',
    paragraphs: [
      'Each door or window is managed as an individual opening — e.g. D-01, D-02, W-01.',
      'Selecting an opening establishes the active opening context used by the engineering tools below.',
    ],
    requiresProject: true,
  },
  {
    id: 'studio',
    section: 'designs',
    tool: 'studio',
    target: '[data-onboard="tool-studio"]',
    title: '3D Studio',
    paragraphs: [
      'Inspect the selected door or window in 3D before fabrication.',
    ],
    bullets: [
      'Assembly and exploded views',
      'Frame, sash, stile, rail, glass and hardware representation',
      'Live dimension rebuilding when you apply a size',
    ],
    requiresProject: true,
  },
  {
    id: 'cad',
    section: 'designs',
    tool: 'cad',
    target: '[data-onboard="tool-cad"]',
    title: '2D CAD',
    paragraphs: [
      'Use the technical drawing workspace to inspect the selected opening in a fabrication-oriented 2D view — dimensions, profiles, elevations and technical geometry.',
    ],
    requiresProject: true,
  },
  {
    id: 'audit',
    section: 'designs',
    tool: 'audit',
    target: '[data-onboard="tool-audit"]',
    title: 'Fabrication Audit',
    paragraphs: [
      'Before manufacturing, check the design for fabrication problems.',
      'The audit reports only real, calculated results — invalid dimensions, missing data, incompatible configuration and other implemented validation warnings. It never invents clean or failing states.',
    ],
    requiresProject: true,
  },
  {
    id: 'cutting',
    section: 'designs',
    tool: 'nesting',
    target: '[data-onboard="tool-nesting"]',
    title: 'Cutting & Nesting',
    paragraphs: [
      'Turn your design into practical profile cutting information.',
    ],
    bullets: [
      'Cut lengths per profile, stock bars, kerf and cutting allowance',
      'Offcuts, waste and material utilization',
      'Visual bar layouts are only ever the real calculated result',
    ],
    requiresProject: true,
  },
  {
    id: 'bom',
    section: 'bom',
    target: '[data-onboard="nav-bom"]',
    title: 'Bill of Materials',
    paragraphs: [
      'The BOM collects the materials and components required for the project — aluminium profiles, glass, gaskets, hardware and accessories.',
      'Quantities always come from the actual project designs and calculations.',
    ],
  },
  {
    id: 'cost',
    section: 'finance',
    tool: 'list',
    target: '[data-onboard="nav-finance"]',
    title: 'LKR Project Cost',
    paragraphs: [
      'Project cost is calculated on Sri Lankan Rupee pricing (LKR), never USD.',
      'Finance derives cost from the real BOM × rates, labour, transport, installation, overhead and discount — with VAT applied from the project tax rate.',
    ],
    requiresProject: true,
  },
  {
    id: 'quotation',
    section: 'quotation',
    target: '[data-onboard="nav-quotation"]',
    title: 'Create a Quotation',
    paragraphs: [
      'Convert the calculated project cost into a professional customer quotation with LKR pricing, totals and taxes.',
      'Internal cost and profit information is never placed on the customer-facing quotation.',
    ],
  },
  {
    id: 'pos',
    section: 'pos',
    target: '[data-onboard="nav-pos"]',
    title: 'Purchase Orders',
    paragraphs: [
      'Purchase orders will connect the approved quotation to material buying — supplier, PO items, quantities, prices and order status.',
      'POs are not implemented yet, so this section honestly shows that no orders exist instead of pretending to work.',
    ],
  },
  {
    id: 'finance',
    section: 'finance',
    target: '[data-onboard="nav-finance"]',
    title: 'Finance Summary',
    paragraphs: [
      'Track the financial side of the project: selling price, project cost, gross profit and margin.',
      'Only real derived values are shown; with no financial data the section says so clearly.',
    ],
  },
  {
    id: 'workflow',
    section: 'workflow',
    target: '',
    title: 'Your FullAluDoor Workflow',
    paragraphs: [
      'Project Details → Design Openings → 3D / 2D Inspection → Fabrication Audit → Cutting / Nesting → BOM → LKR Cost → Quotation → Purchase Orders → Finance.',
      'Design accurately, fabricate confidently, and keep the entire project connected.',
    ],
    final: true,
  },
];

export function visibleTourSteps(opts: { hasProject: boolean }): TourStep[] {
  return TOUR_STEPS.filter(
    (step) => !step.skipAlways && (!step.requiresProject || opts.hasProject)
  );
}

/**
 * Keep only steps whose target exists right now, skipping (never crashing) any
 * step that has no available target element. The final workflow step is always
 * kept because it is content only and needs no element.
 */
export function filterStepsByTargets(steps: TourStep[], hasTarget: (step: TourStep) => boolean): TourStep[] {
  return steps.filter((step) => step.final === true || step.target === '' || hasTarget(step));
}
