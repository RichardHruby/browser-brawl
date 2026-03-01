import type { Task } from '@/types/game';

export const TASKS: Task[] = [
  {
    id: 'amazon-toothpaste',
    label: 'Amazon Toothpaste',
    description:
      'Go to amazon.com, search for "Sensodyne toothpaste", and add the first result to the cart.',
    startUrl: 'https://www.amazon.com',
    tags: ['shopping', 'ecommerce'],
  },
  {
    id: 'google-flights',
    label: 'Google Flights',
    description:
      'Go to Google Flights and find the cheapest one-way flight from New York (JFK) to Los Angeles (LAX) for next Friday.',
    startUrl: 'https://www.google.com/flights',
    tags: ['travel', 'search'],
  },
  {
    id: 'techcrunch-newsletter',
    label: 'TechCrunch Newsletter',
    description:
      'Go to TechCrunch.com and sign up for their newsletter using the email address test@browserbrawl.com.',
    startUrl: 'https://techcrunch.com',
    tags: ['newsletter', 'signup'],
  },
];
