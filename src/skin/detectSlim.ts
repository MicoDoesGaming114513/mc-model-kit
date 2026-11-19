/**
 * Best-effort Steve (classic) / Alex (slim) detection from a 64x64 skin.
 *
 * Slim skins only use 3px-wide arms, so the unused columns at the end of the
 * right-arm and left-arm UV islands stay transparent. Classic skins paint them.
 */
export function detectSlimSkin(image: CanvasImageSource, width: number, height: number): boolean {
  if (width < 64 || height < 64) return false;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return false;
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;

  const scaleX = width / 64;
  const scaleY = height / 64;

  const regionIsTransparent = (x0: number, x1: number, y0: number, y1: number): boolean => {
    for (let y = Math.floor(y0 * scaleY); y < Math.floor(y1 * scaleY); y++) {
      for (let x = Math.floor(x0 * scaleX); x < Math.floor(x1 * scaleX); x++) {
        const alpha = pixels[(y * width + x) * 4 + 3];
        if (alpha > 8) return false;
      }
    }
    return true;
  };

  // Right arm unused columns: x 54..56, y 20..32
  const rightArmUnused = regionIsTransparent(54, 56, 20, 32);
  // Left arm unused columns: x 46..48, y 52..64
  const leftArmUnused = regionIsTransparent(46, 48, 52, 64);

  return rightArmUnused && leftArmUnused;
}

/**
 * Expands a legacy 64x32 skin to the modern 64x64 layout by mirroring the
 * right limbs into the left limb UV islands. Returns `null` when no expansion
 * is needed.
 */
export function expandLegacySkin(
  image: CanvasImageSource,
  width: number,
  height: number,
): HTMLCanvasElement | null {
  if (width !== 64 || height !== 32) return null;

  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) return null;

  context.imageSmoothingEnabled = false;
  // Copy the top half as-is (head, body, right arm, right leg).
  context.drawImage(image, 0, 0);

  const mirrorRegion = (sx: number, sy: number, sw: number, sh: number, dx: number, dy: number) => {
    context.save();
    context.translate(dx + sw, dy);
    context.scale(-1, 1);
    context.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
    context.restore();
  };

  // Left leg from right leg (0,16,16,16) -> (16,48)
  mirrorRegion(0, 16, 16, 16, 16, 48);
  // Left arm from right arm (40,16,16,16) -> (32,48)
  mirrorRegion(40, 16, 16, 16, 32, 48);

  return canvas;
}
