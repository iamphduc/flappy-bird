import { STEPS_PER_SECOND } from "@flappy/engine";

// Placeholder screen until the game-core sprint adds the real game.
const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const ctx = canvas.getContext("2d")!;
ctx.fillStyle = "#70c5ce";
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.fillStyle = "#fff";
ctx.font = "20px sans-serif";
ctx.textAlign = "center";
ctx.fillText("Flappy Bird", canvas.width / 2, canvas.height / 2);

const status = document.querySelector<HTMLParagraphElement>("#status")!;
fetch("/api/health")
  .then((res) => res.json())
  .then((body: { ok: boolean }) => {
    status.textContent = body.ok
      ? `Server OK · engine at ${STEPS_PER_SECOND} steps/s`
      : "Server error";
  })
  .catch(() => {
    status.textContent = "Server unreachable";
  });
