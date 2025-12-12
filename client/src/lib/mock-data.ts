
import bitcoinImg from '@assets/generated_images/bitcoin_neon_chart_futuristic.png';
import fedImg from '@assets/generated_images/federal_reserve_building_ominous.png';
import gtaImg from '@assets/generated_images/gta_vi_vice_city_vibe.png';
import marsImg from '@assets/generated_images/spacex_rocket_on_mars.png';
import swiftImg from '@assets/generated_images/rock_concert_stage_lights.png';

export interface Market {
  id: string;
  question: string;
  category: string;
  volume: string;
  yesPrice: number;
  noPrice: number;
  endDate: string;
  imageUrl?: string;
}

export const MOCK_MARKETS: Market[] = [
  {
    id: "1",
    question: "Will Bitcoin hit $100k before 2025?",
    category: "Crypto",
    volume: "$12.5M",
    yesPrice: 0.32,
    noPrice: 0.68,
    endDate: "Dec 31, 2024",
    imageUrl: bitcoinImg
  },
  {
    id: "2",
    question: "Will the Fed cut rates in March?",
    category: "Economics",
    volume: "$4.2M",
    yesPrice: 0.15,
    noPrice: 0.85,
    endDate: "Mar 20, 2024",
    imageUrl: fedImg
  },
  {
    id: "3",
    question: "Will GTA VI release in 2025?",
    category: "Gaming",
    volume: "$8.1M",
    yesPrice: 0.88,
    noPrice: 0.12,
    endDate: "Dec 31, 2025",
    imageUrl: gtaImg
  },
  {
    id: "4",
    question: "Will SpaceX land on Mars by 2030?",
    category: "Science",
    volume: "$2.9M",
    yesPrice: 0.12,
    noPrice: 0.88,
    endDate: "Jan 1, 2030",
    imageUrl: marsImg
  },
  {
    id: "5",
    question: "Will Taylor Swift release a rock album in 2024?",
    category: "Culture",
    volume: "$1.5M",
    yesPrice: 0.05,
    noPrice: 0.95,
    endDate: "Dec 31, 2024",
    imageUrl: swiftImg
  }
];
