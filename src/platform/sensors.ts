import { cameraVector, headingOf, rotationRateMagnitude, type EulerReading } from "../core/orientation";
import { simEnabled, simSensorSource } from "../dev/sim";

export interface SensorHandlers {
  /** Gyro-fused orientation (relative on iOS). `t` is performance.now(). */
  onOrientation(r: EulerReading, t: number): void;
  /** Absolute compass heading of the camera direction, when the platform gives one. Logged only. */
  onAbsoluteHeading(deg: number, t: number): void;
  /** Rotation rate magnitude in deg/s. */
  onMotion(rateDegPerSec: number, t: number): void;
}

export interface SensorSource {
  start(h: SensorHandlers): () => void;
}

type IOSOrientationEvent = DeviceOrientationEvent & { webkitCompassHeading?: number; webkitCompassAccuracy?: number };

const browserSensors: SensorSource = {
  start(h) {
    const onOrientation = (e: DeviceOrientationEvent) => {
      if (e.alpha == null || e.beta == null || e.gamma == null) return;
      const t = performance.now();
      h.onOrientation({ alpha: e.alpha, beta: e.beta, gamma: e.gamma }, t);
      // iOS: compass heading of the device's top edge, adjusted by iOS for how it's held.
      const compass = (e as IOSOrientationEvent).webkitCompassHeading;
      if (typeof compass === "number" && compass >= 0) h.onAbsoluteHeading(compass, t);
    };
    // Android: the same Euler angles, but anchored to magnetic north.
    const onAbsolute = (e: DeviceOrientationEvent) => {
      if (e.alpha == null || e.beta == null || e.gamma == null) return;
      h.onAbsoluteHeading(headingOf(cameraVector({ alpha: e.alpha, beta: e.beta, gamma: e.gamma })), performance.now());
    };
    const onMotion = (e: DeviceMotionEvent) => {
      h.onMotion(rotationRateMagnitude(e.rotationRate), performance.now());
    };
    window.addEventListener("deviceorientation", onOrientation);
    window.addEventListener("deviceorientationabsolute" as "deviceorientation", onAbsolute);
    window.addEventListener("devicemotion", onMotion);
    return () => {
      window.removeEventListener("deviceorientation", onOrientation);
      window.removeEventListener("deviceorientationabsolute" as "deviceorientation", onAbsolute);
      window.removeEventListener("devicemotion", onMotion);
    };
  },
};

export function sensorSource(): SensorSource {
  return simEnabled() ? simSensorSource : browserSensors;
}
