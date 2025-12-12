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
    imageUrl: "https://images.unsplash.com/photo-1518546305927-5a555bb7020d?q=80&w=1000&auto=format&fit=crop"
  },
  {
    id: "2",
    question: "Will the Fed cut rates in March?",
    category: "Economics",
    volume: "$4.2M",
    yesPrice: 0.15,
    noPrice: 0.85,
    endDate: "Mar 20, 2024",
    imageUrl: "https://images.unsplash.com/photo-1611974765270-ca1258634369?q=80&w=1000&auto=format&fit=crop"
  },
  {
    id: "3",
    question: "Will GTA VI release in 2025?",
    category: "Gaming",
    volume: "$8.1M",
    yesPrice: 0.88,
    noPrice: 0.12,
    endDate: "Dec 31, 2025",
    imageUrl: "https://images.unsplash.com/photo-1552820728-8b83bb6b773f?q=80&w=1000&auto=format&fit=crop"
  },
  {
    id: "4",
    question: "Will SpaceX land on Mars by 2030?",
    category: "Science",
    volume: "$2.9M",
    yesPrice: 0.12,
    noPrice: 0.88,
    endDate: "Jan 1, 2030",
    imageUrl: "https://images.unsplash.com/photo-1517976487492-5750f3195933?q=80&w=1000&auto=format&fit=crop"
  },
  {
    id: "5",
    question: "Will Taylor Swift release a rock album in 2024?",
    category: "Culture",
    volume: "$1.5M",
    yesPrice: 0.05,
    noPrice: 0.95,
    endDate: "Dec 31, 2024",
    imageUrl: "https://images.unsplash.com/photo-1514525253440-b393452e8d26?q=80&w=1000&auto=format&fit=crop"
  }
];
