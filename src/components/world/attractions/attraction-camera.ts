/** Compatibility exports for existing scene callers; implementation is venue-independent. */
export { RideCameraOrientation as AttractionCameraOrientation, RIDE_CABIN_FOV as ATTRACTION_CABIN_FOV,
  rideCabinFov as attractionCabinFov, rideCameraSweepOrigin as attractionCameraSweepOrigin,
  rideCameraPose as attractionCameraPose, rideLookRevision as attractionLookRevision,
  resetRideLook as resetAttractionLook, turnRideLook as turnAttractionLook,
  zoomRideLook as zoomAttractionLook, rideLook as attractionLook } from '../rides/ride-camera';
