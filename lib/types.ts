export type TypologyId =
  | '100D-single'
  | '100D-double'
  | '70S-sliding-2p'
  | '70S-sliding-4p'
  | '74-cgroove'
  | 'casement';

export type FinishType = 'natural' | 'black' | 'bronze' | 'white';

export type GlassType =
  | '6mm-clear'
  | '8mm-tinted'
  | '10.38mm-laminated'
  | '12mm-toughened'
  | '24mm-dgu';

export interface OpeningItem {
  id: string;
  tag: string; // e.g. D-01, W-01
  name: string;
  system: TypologyId;
  width: number; // mm
  height: number; // mm
  quantity: number;
  finish: FinishType;
  glass: GlassType;
  location: string; // e.g. Ground Floor / Master Bed
  notes?: string;
  hingeSide?: 'left' | 'right';
  openingAngle?: number;
}

export interface ProjectMetadata {
  id: string;
  projectName: string;
  clientName: string;
  projectNumber: string;
  date: string;
  currency: string;
  taxRatePercent: number;
  contractorName: string;
}

export interface CutItem {
  id: string;
  openingTag: string;
  profile: string;
  description: string;
  qty: number;
  length: number;
  ends: string;
  angleLeft: number;
  angleRight: number;
  group: 'Outer Frame' | 'Sash / Leaf' | 'Glazing Bead' | 'Transom / Mullion' | 'Hardware';
  unitWeightKgM: number;
  totalWeightKg: number;
}

export interface DerivedOpening {
  config: OpeningItem;
  frameFace: number;
  clearWidth: number;
  clearHeight: number;
  leafWidth: number;
  leafHeight: number;
  glassPanels: Array<{
    id: string;
    width: number;
    height: number;
    areaM2: number;
    thickness: number;
    description: string;
    qty: number;
  }>;
  hardware: Array<{
    code: string;
    name: string;
    qty: number;
    unit: string;
    category: 'Fasteners' | 'Hinges' | 'Rollers' | 'Locks' | 'Cleats' | 'Gaskets';
  }>;
  cutList: CutItem[];
  areaM2: number;
  perimeterM: number;
  totalAluWeightKg: number;
}

export interface NestedBarPiece {
  cutId: string;
  openingTag: string;
  pieceDescription: string;
  lengthMm: number;
  angleL: number;
  angleR: number;
}

export interface NestedBar {
  barIndex: number;
  profileCode: string;
  profileDescription: string;
  stockLengthMm: number;
  usedLengthMm: number;
  remainingOffcutMm: number;
  isReusableOffcut: boolean;
  kerfWasteMm: number;
  efficiencyPercent: number;
  cuts: NestedBarPiece[];
}

export interface ProfileNestingResult {
  profileCode: string;
  profileDescription: string;
  unitWeightKgM: number;
  stockLengthMm: number;
  bladeKerfMm: number;
  totalStockBars: number;
  totalNetLengthM: number;
  totalStockLengthM: number;
  totalWeightKg: number;
  overallYieldPercent: number;
  totalScrapWastePercent: number;
  totalReusableOffcutsM: number;
  bars: NestedBar[];
}

export interface ProjectNestingSummary {
  resultsByProfile: ProfileNestingResult[];
  totalBarsToPull: number;
  totalProfileLengthM: number;
  totalStockLengthM: number;
  totalAluWeightKg: number;
  overallEfficiencyPercent: number;
  totalReusableOffcutsM: number;
  totalScrapOffcutsM: number;
}

export interface MasterBOMItem {
  category: 'Extrusions' | 'Glass' | 'Hardware' | 'Gaskets & Seals';
  code: string;
  description: string;
  quantity: number;
  unit: string;
  unitWeightKg?: number;
  totalWeightKg?: number;
  unitCost: number;
  totalCost: number;
}

export interface CommercialQuote {
  project: ProjectMetadata;
  items: Array<{
    tag: string;
    systemName: string;
    width: number;
    height: number;
    qty: number;
    unitPrice: number;
    totalPrice: number;
    glassSpec: string;
    finish: string;
    areaM2: number;
  }>;
  materialCost: number;
  laborAssemblyCost: number;
  glassCost: number;
  hardwareCost: number;
  powderCoatingCost: number;
  subtotal: number;
  taxAmount: number;
  grandTotal: number;
}
