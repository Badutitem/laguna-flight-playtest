// Keyboard, mouse and touch: one job, turn gestures into control values and
// one-shot actions. Throttle is held here so W/S, the wheel and the HUD
// buttons all move the same lever.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;
export const ACTION_GEAR = 8;
export const ACTION_FLAPS = 16;
export const ACTION_CAMERA = 32;
export const ACTION_MUTE = 64;
export const ACTION_BACK = 128;
export const ACTION_MISSILE = 256;
export const ACTION_LOOP = 512;
export const ACTION_ROLL = 1024;

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let throttle = 0;
  let drag = null; // { x, y, dx, dy } while the pointer steers
  let dragSteer = { pitch: 0, roll: 0 };
  // Touch controls (phone): the virtual stick feeds steer here, the
  // throttle slider drives setThrottle, BRAKE is a held flag. All three
  // are zero/false unless a finger is actually on a touch control.
  let touchSteer = { pitch: 0, roll: 0 };
  // Smoothed copy of the stick: a finger on a small phone stick jitters
  // from frame to frame, and feeding that raw into the flight model
  // makes the plane twitch. Easing toward the target costs ~3 frames
  // of lag and reads as smooth instead of jerky.
  let smoothTouch = { pitch: 0, roll: 0 };
  let touchBrake = false;
  // Touch FIRE is a held flag like BRAKE: the FIRE button feeds it, and
  // Space on the keyboard is the same trigger in the air (on the ground
  // Space is still the brake — the flight model only brakes on the ground,
  // and combat only fires in the air, so the two never fight).
  let touchFire = false;

  function keyName(event) {
    if (event.code === 'Space') return 'Space';
    return event.key.length === 1 ? event.key.toLowerCase() : event.key;
  }

  window.addEventListener('keydown', (event) => {
    const key = keyName(event);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.key)) {
      event.preventDefault();
    }
    if (event.repeat) return;
    keys.add(key);
    if (key === 'Enter' || key === ' ') actions |= ACTION_CONFIRM;
    if (key === 'p' || key === 'Escape') actions |= ACTION_PAUSE;
    if (key === 'r') actions |= ACTION_RESTART;
    if (key === 'g') actions |= ACTION_GEAR;
    if (key === 'f') actions |= ACTION_FLAPS;
    if (key === 'c') actions |= ACTION_CAMERA;
    if (key === 'm') actions |= ACTION_MUTE;
    if (key === 'q') actions |= ACTION_MISSILE;
    if (key === 'l') actions |= ACTION_LOOP;
    if (key === 'b') actions |= ACTION_ROLL;
    if (key === 'Backspace') actions |= ACTION_BACK;
  });
  window.addEventListener('keyup', (event) => keys.delete(keyName(event)));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('pointerdown', (event) => {
    drag = { x: event.clientX, y: event.clientY, dx: 0, dy: 0 };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!drag) return;
    drag.dx = event.clientX - drag.x;
    drag.dy = event.clientY - drag.y;
    const range = 140;
    dragSteer.roll = Math.max(-1, Math.min(1, drag.dx / range));
    dragSteer.pitch = Math.max(-1, Math.min(1, -drag.dy / range));
  });
  function endDrag() {
    drag = null;
    dragSteer = { pitch: 0, roll: 0 };
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    throttle = Math.min(1, Math.max(0, throttle - Math.sign(event.deltaY) * 0.06));
  }, { passive: false });

  // Read the live control values for this frame.
  function control() {
    let pitch = 0;
    let roll = 0;
    if (keys.has('ArrowUp')) pitch += 1;
    if (keys.has('ArrowDown')) pitch -= 1;
    if (keys.has('ArrowLeft')) roll -= 1;
    if (keys.has('ArrowRight')) roll += 1;
    if (keys.has('w') || keys.has('W')) throttle = Math.min(1, throttle + 0.008);
    if (keys.has('s') || keys.has('S')) throttle = Math.max(0, throttle - 0.008);
    if (keys.has('Shift')) throttle = Math.min(1, throttle + 0.02);
    if (keys.has('Control')) throttle = Math.max(0, throttle - 0.02);
    if (drag) {
      pitch += dragSteer.pitch;
      roll += dragSteer.roll;
    }
    smoothTouch.pitch += (touchSteer.pitch - smoothTouch.pitch) * 0.35;
    smoothTouch.roll += (touchSteer.roll - smoothTouch.roll) * 0.35;
    pitch += smoothTouch.pitch;
    roll += smoothTouch.roll;
    return {
      pitch: Math.max(-1, Math.min(1, pitch)),
      roll: Math.max(-1, Math.min(1, roll)),
      throttle,
      brake: keys.has(' ') || keys.has('Space') || touchBrake,
      firing: keys.has(' ') || keys.has('Space') || touchFire,
    };
  }

  function setTouchSteer(pitch, roll) {
    touchSteer = {
      pitch: Math.max(-1, Math.min(1, pitch)),
      roll: Math.max(-1, Math.min(1, roll)),
    };
  }

  function setTouchBrake(value) {
    touchBrake = !!value;
  }

  function setTouchFire(value) {
    touchFire = !!value;
  }

  function setThrottle(value) {
    throttle = Math.min(1, Math.max(0, value));
  }

  function queueAction(action) {
    actions |= action;
  }

  function takeActions() {
    const taken = actions;
    actions = 0;
    return taken;
  }

  return { control, setThrottle, setTouchSteer, setTouchBrake, setTouchFire, queueAction, takeActions };
}
