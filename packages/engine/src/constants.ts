// Game tuning values. Distances are in pixels, speeds in pixels per step,
// and the engine runs at 60 steps per second.

/** Physics steps per second. Fixed so games play the same on any screen. */
export const STEPS_PER_SECOND = 60;

/** World size, matching the client canvas. */
export const WORLD_WIDTH = 288;
export const WORLD_HEIGHT = 512;

/** Height of the ground strip at the bottom of the world. */
export const GROUND_HEIGHT = 112;
/** Y of the ground's top edge. Touching it kills the bird. */
export const GROUND_Y = WORLD_HEIGHT - GROUND_HEIGHT;

/** Bird hitbox: a square with its left edge at BIRD_X. */
export const BIRD_X = 60;
export const BIRD_SIZE = 24;
/** Bird's starting y (top edge of its hitbox). */
export const BIRD_START_Y = 200;

/** Added to the bird's vertical speed every step without a flap. */
export const GRAVITY = 0.35;
/** Vertical speed set by a flap (negative is up). */
export const FLAP_VELOCITY = -6.5;
/** Fastest the bird can fall. */
export const MAX_FALL_SPEED = 9;

export const PIPE_WIDTH = 52;
/** Height of the opening between the top and bottom pipe. */
export const PIPE_GAP = 110;
/** How far pipes move left each step. */
export const PIPE_SPEED = 2;
/** Horizontal distance between the left edges of two pipes in a row. */
export const PIPE_SPACING = 170;
/** Where the first pipe starts (off-screen right). */
export const FIRST_PIPE_X = WORLD_WIDTH + 100;
/** Range for a pipe's gap center, inclusive. */
export const GAP_CENTER_MIN = 110;
export const GAP_CENTER_MAX = 290;
