export const CHALLENGE_PROMPTS = [
  "Cyberpunk tea party in 1890 Victorian London",
  "An astronaut discovering an ancient medieval castle on Mars",
  "A cozy Japanese ramen shop built on top of a giant swimming whale",
  "Steampunk dragon powered by glowing clockwork and brass gears",
  "Futuristic bioluminescent jungle with neon crystalline waterfalls",
  "A retro 80s arcade inside an orbiting space station",
  "An underwater library carved inside a coral reef with glowing jellyfish lanterns",
  "A post-apocalyptic coffee barista serving robots in the year 3000",
  "An ancient wizard coding on a holographic terminal in an enchanted tower",
  "Surreal floating islands connected by radiant rainbow bridges at twilight"
];

export function getRandomPrompt() {
  const index = Math.floor(Math.random() * CHALLENGE_PROMPTS.length);
  return CHALLENGE_PROMPTS[index];
}
