// Game version
export const VERSION = "0.0.1";

// Weapon system
export const WEAPONS = [
    { name: "Kitchen Knife", damage: 25, range: 2, projectile: false, cooldown: 200, color: 0xcccccc },
    { name: "Cricket Bat", damage: 35, range: 3, projectile: false, cooldown: 400, color: 0x8B4513 },
    { name: "Crossbow", damage: 50, range: 15, projectile: true, cooldown: 800, color: 0x8B4513 }
];

// British gang slang messages
export const ENEMY_MESSAGES = [
    "Inshallah",
    "Don't fuck with the somalis bruh",
    "You think you're hard, fam?",
    "I'll do ya, swear on me mum!",
    "You're proper muggy, innit?",
    "Mans gonna chef you up!",
    "I'll shank your nan!",
    "You're getting bodied today!",
    "Wasteman ting!",
    "Allow it fam!",
    "You're bare finished!",
    "Pussyole!",
    "Shut up, you dickhead!",
    "What's your beef, blud?",
    "You're chattin' wass!",
    "I'll merk you, bruv!",
    "You're getting dropped, fam!",
    "Dead to the world, innit!",
    "I'll bang you out proper!"
];

// Colors for environment
export const COLORS = {
    GROUND: 0x777777, // Asphalt
    BUILDING: 0xaaaaaa, // Gray buildings
    GRASS: 0x669933, // British lawn
    PLAYER: 0x0000ff, // Blue player
    ENEMY: 0xff0000, // Red enemies
    PROJECTILE: 0xffff00 // Yellow projectiles
}; 