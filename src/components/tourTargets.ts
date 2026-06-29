import { createRef } from 'react';

// Shared refs for the guided tour. Screens attach these refs to the real UI
// elements; AppTour measures them (measureInWindow) so each coachmark can
// highlight and point at the actual control on screen.
export type TourTargetKey =
  | 'drop'
  | 'radius'
  | 'history'
  | 'watchTab'
  | 'settings'
  | 'mapStyle'
  | 'watchToggle'
  | 'lock'
  // Not a coachmark target — a reference to the map container so AppTour can
  // correct measurements for controls overlaid on the native map (see below).
  | 'mapRoot';

export const tourRefs: Record<TourTargetKey, React.RefObject<any>> = {
  drop: createRef(),
  radius: createRef(),
  history: createRef(),
  watchTab: createRef(),
  settings: createRef(),
  mapStyle: createRef(),
  watchToggle: createRef(),
  lock: createRef(),
  mapRoot: createRef(),
};
