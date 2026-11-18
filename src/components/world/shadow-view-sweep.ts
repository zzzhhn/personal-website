import { Frustum, type Matrix4, type Vector3 } from 'three';

/** A caster can contribute if its shadow reaches the camera before passing below the receivers. */
export class ShadowViewSweep {
  private readonly frustum = new Frustum();
  private readonly rates = new Float64Array(6);

  constructor(private readonly sunDirection: Vector3) {}

  update(projectionView: Matrix4) {
    this.frustum.setFromProjectionMatrix(projectionView);
    this.frustum.planes.forEach((plane, i) => {
      this.rates[i] = -plane.normal.dot(this.sunDirection);
    });
  }

  intersects(x: number, y: number, z: number, radius: number) {
    let first = 0;
    let last = Math.max(0, (y + radius + .7) / this.sunDirection.y);
    for (let i = 0; i < 6; i++) {
      const plane = this.frustum.planes[i], n = plane.normal;
      // Signed distance to this plane at travel t is start + rate * t.
      // Expanding each plane by the caster radius conservatively includes corners.
      const start = n.x * x + n.y * y + n.z * z + plane.constant + radius + 1e-7;
      const rate = this.rates[i];
      if (start < 0) {
        if (rate <= 0) return false;
        first = Math.max(first, -start / rate);
      } else if (rate < 0) {
        last = Math.min(last, -start / rate);
      }
      if (first > last) return false;
    }
    return true;
  }
}
