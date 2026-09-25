// Word lists for generated player names ("Wobbly Otter 42").
// Rule: capitalized letters only, no duplicates, and the longest adjective plus
// the longest animal stay within 15 letters so every name fits the 1-20 nickname rule.

export const ADJECTIVES: readonly string[] = [
  "Wobbly", "Sleepy", "Fluffy", "Grumpy", "Bouncy", "Giggly", "Sneaky", "Clumsy",
  "Jolly", "Fuzzy", "Silly", "Zippy", "Cheeky", "Dizzy", "Goofy", "Happy",
  "Wiggly", "Snappy", "Plucky", "Breezy", "Sparkly", "Cosmic", "Brave", "Speedy",
];

export const ANIMALS: readonly string[] = [
  "Otter", "Penguin", "Panda", "Llama", "Walrus", "Badger", "Gecko", "Hamster",
  "Koala", "Moose", "Puffin", "Sloth", "Wombat", "Narwhal", "Alpaca", "Ferret",
  "Toucan", "Lemur", "Hedgehog", "Goose", "Pigeon", "Beaver", "Squid", "Yak",
];

const pick = (list: readonly string[], r: number): string => list[Math.floor(r * list.length)] as string;

/** A random "<Adjective> <Animal> <1-99>" name. */
export function funnyName(random: () => number = Math.random): string {
  const adjective = pick(ADJECTIVES, random());
  const animal = pick(ANIMALS, random());
  const n = 1 + Math.floor(random() * 99);
  return `${adjective} ${animal} ${n}`;
}
