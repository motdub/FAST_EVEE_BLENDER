export interface ColorCorrectionSettings {
  brightness: number; // 0.5..1.5 multiplier
  contrast: number;   // 0.5..2.0 multiplier
  saturation: number; // 0..2.0
  bloom: number;      // 0..1
}