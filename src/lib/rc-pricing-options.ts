export interface RcPricingOptions {
  brands: string[];
  modelsByBrand: Record<string, string[]>;
  scales: string[];
  versions: string[];
}

export const RC_PRICING_OPTIONS: Record<string, RcPricingOptions> = {
  drones: {
    brands: ["DJI", "Autel Robotics", "FIMI", "Hubsan", "Parrot", "Skydio", "Walksnail", "iFlight", "BetaFPV", "GEPRC"],
    modelsByBrand: {
      DJI: ["Mini 4 Pro", "Air 3S", "Mavic 3 Pro", "Avata 2", "FPV"],
      "Autel Robotics": ["EVO Lite+", "EVO II Pro", "EVO Nano+"],
      FIMI: ["X8 Mini", "X8 SE 2022", "Mini 3"],
      Hubsan: ["Zino Mini Pro", "Zino 2+"],
      iFlight: ["Nazgul Evoque F5", "Chimera7 Pro", "Defender 25"],
      BetaFPV: ["Cetus X", "Meteor75 Pro", "Pavo Pico"],
      GEPRC: ["Mark5", "CineLog35", "CineBot30"]
    },
    scales: ["Sub-250 g", "2-inch", "2.5-inch", "3-inch", "3.5-inch", "5-inch", "7-inch", "10-inch"],
    versions: ["2026", "2025", "2024", "2023", "V3", "V2", "V1"]
  },
  helis: {
    brands: ["Align", "Blade", "Goosky", "Mikado", "OMP Hobby", "SAB Goblin", "Soxos", "XLPower", "Yuxiang"],
    modelsByBrand: {
      Align: ["T-Rex 450", "T-Rex 550X", "T-Rex 700X", "T-Rex 800"],
      Blade: ["Nano S3", "Fusion 360", "Fusion 550", "Infusion 180"],
      Goosky: ["S1", "S2", "RS4", "Legend S2"],
      "OMP Hobby": ["M1 Evo", "M2 Evo", "M4"],
      "SAB Goblin": ["Raw 420", "Raw 580", "Raw 700", "Kraken 700"],
      Mikado: ["Logo 200", "Logo 480", "Logo 700"]
    },
    scales: ["100 size", "180 size", "250 size", "300 size", "450 size", "500 size", "550 size", "600 size", "700 size", "800 size"],
    versions: ["2026", "2025", "2024", "2023", "Evo", "V2", "V1"]
  },
  planes: {
    brands: ["Arrows RC", "Dynam", "E-flite", "FMS", "Freewing", "HobbyZone", "Multiplex", "Pilot-RC", "SebArt", "Volantex"],
    modelsByBrand: {
      "E-flite": ["Timber X", "Turbo Timber Evolution", "Habu SS", "F-16 Thunderbirds", "Carbon-Z Cub"],
      FMS: ["Ranger", "Kingfisher", "Maulet", "Futura", "Super Scorpion"],
      Freewing: ["F-14 Tomcat", "F-22 Raptor", "Avanti S", "Vulcan"],
      HobbyZone: ["AeroScout S 2", "Carbon Cub S 2", "Sport Cub S 2"],
      "Pilot-RC": ["Extra NG", "Edge 540", "Slick 360"]
    },
    scales: ["Micro", "1/10", "1/8", "1/6", "1/5", "1/4", "30cc", "50cc", "70cc", "100cc"],
    versions: ["2026", "2025", "2024", "2023", "V3", "V2", "V1"]
  },
  cars: {
    brands: ["ARRMA", "Axial", "HPI Racing", "Losi", "Redcat Racing", "Team Associated", "Team Corally", "Tamiya", "Traxxas", "Kyosho"],
    modelsByBrand: {
      ARRMA: ["Kraton 6S BLX", "Kraton 6S EXB", "Kraton 8S", "Notorious 6S", "Outcast 8S", "Mojave 6S", "Typhon 6S", "Infraction 6S"],
      Axial: ["SCX10 III", "SCX6", "Capra 1.9", "UTB18 Capra"],
      Losi: ["Super Baja Rey 2.0", "Tenacity DB Pro", "DBXL-E 2.0", "Promoto-MX"],
      "Team Associated": ["RC10B7", "RC8B4.1e", "Pro4 SC10"],
      Tamiya: ["TT-02", "BBX", "Clod Buster", "Wild One", "Lunch Box"],
      Traxxas: ["X-Maxx", "XRT", "Maxx", "Sledge", "Slash", "TRX-4", "UDR"],
      Kyosho: ["Inferno MP10e", "Mad Van VE", "USA-1 VE", "Mini-Z"]
    },
    scales: ["1/5", "1/6", "1/7", "1/8", "1/10", "1/12", "1/14", "1/16", "1/18", "1/24", "1/28"],
    versions: ["2026", "2025", "2024", "2023", "V6", "V5", "V4", "V3", "V2", "V1", "EXB", "BLX"]
  }
};

export function pricingOptionsFor(vehicleFamily: string) {
  return RC_PRICING_OPTIONS[vehicleFamily] ?? RC_PRICING_OPTIONS.cars;
}

export function modelsForBrand(vehicleFamily: string, brand: string) {
  const options = pricingOptionsFor(vehicleFamily);
  const match = Object.keys(options.modelsByBrand).find((item) => item.toLowerCase() === brand.trim().toLowerCase());
  return match ? options.modelsByBrand[match] : Object.values(options.modelsByBrand).flat();
}
