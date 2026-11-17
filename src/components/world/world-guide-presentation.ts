import type { Object3D } from 'three';
import type { GuidePresentation, GuidePresentationFrame } from './guide-presentation';
import { GuideMineLayer } from './WorldGuideMine';
import { GuideExchangeLayer } from './WorldGuideExchange';
import { GuideIbdInspectionLayer } from './WorldGuideIbdInspection';
import { GuideCampLayer } from './WorldGuideCamp';
import { guideActionHand } from './rides/guide-action-hand';
import { campPropActor, campPropHand } from './camp-prop-interactions';
import { factoryConsoleHandTarget } from './factory/factory-operator-pose';
import { ibdInspectionBody, ibdInspectionVisualSockets } from './attractions/ibd-inspection-motion';
import { ibdInspectionHands } from './attractions/ibd-inspection-hands';
import { exchangeBody, exchangeVisualSockets } from './alpha-exchange-motion';
import { mineVisualSockets, useAlphaMineStore } from './alpha-mine-state';
import { useWorldStore } from './store';
import type { Vec3 } from './types';

/** World composition owns venue priorities; the guide only knows pose lifecycle phases. */
export class WorldGuidePresentation implements GuidePresentation {
  readonly mine: GuideMineLayer;
  private readonly exchange: GuideExchangeLayer;
  private readonly inspection: GuideIbdInspectionLayer;
  private readonly contact: GuideCampLayer;
  private actionHand: typeof campPropHand = campPropHand;
  private campTarget: Vec3 | null = null;
  private handTarget: Vec3 | null = null;
  private contactActive = false;

  constructor(scene: Object3D) {
    this.mine = new GuideMineLayer(scene);
    this.exchange = new GuideExchangeLayer(scene);
    this.inspection = new GuideIbdInspectionLayer(scene);
    this.contact = new GuideCampLayer(scene);
  }

  prepare(frame: GuidePresentationFrame) {
    const world = useWorldStore.getState();
    this.actionHand = guideActionHand.owner ? guideActionHand : campPropHand;
    const allowed = frame.shown && frame.contactAllowed && !world.card;
    this.campTarget = allowed && (frame.frozen || campPropActor.available) ? this.actionHand.target : null;
    this.handTarget = this.campTarget ?? (allowed
      ? factoryConsoleHandTarget(world.factoryStation, world.position, frame.facing, frame.speedMps) : null);
    if (!this.handTarget) this.contact.reset();
    if (!this.campTarget) this.actionHand.palm = null;
  }

  get blocksIdle() {
    const mine = useAlphaMineStore.getState();
    return !!(this.handTarget || useWorldStore.getState().factoryStation || mine.action || mine.carried || mine.equipped);
  }

  hide() {
    this.mine.hide();
    Object.assign(exchangeVisualSockets, this.exchange.apply(null, null, false));
    Object.assign(mineVisualSockets, { valid: false, sampledActionKind: null, sampledElapsed: 0 });
    Object.assign(ibdInspectionVisualSockets, this.inspection.apply(null, null, false));
  }

  restoreContactPose() { this.contact.restore(); }
  restoreActivityPose() {
    this.mine.restore();
    this.exchange.restore();
    this.inspection.restore();
  }

  applyActivityPose(handsAvailable: boolean, sitting: boolean) {
    const card = useWorldStore.getState().card;
    const exchangeActive = !!exchangeBody.action || !!exchangeBody.carried;
    const inspectionActive = !!ibdInspectionBody.action || !!ibdInspectionBody.carried;
    this.contactActive = !!this.handTarget && handsAvailable && !sitting;
    const otherHandsAvailable = handsAvailable && !this.contactActive;
    this.mine.apply(useAlphaMineStore.getState(), otherHandsAvailable && !exchangeActive && !inspectionActive);
    Object.assign(exchangeVisualSockets, this.exchange.apply(exchangeBody.action, exchangeBody.carried,
      otherHandsAvailable && !card && !inspectionActive));
    Object.assign(ibdInspectionVisualSockets, this.inspection.apply(ibdInspectionBody.action, ibdInspectionBody.carried,
      otherHandsAvailable && !card && !exchangeActive));
    ibdInspectionHands.left = this.inspection.arms?.left.palm ?? null;
    ibdInspectionHands.right = this.inspection.arms?.right.palm ?? null;
  }

  applyContactPose(dt: number) {
    if (this.contactActive && this.handTarget) {
      const palm = this.contact.apply(this.handTarget, this.campTarget ? this.actionHand.mode : 'grip', dt);
      if (this.campTarget) this.actionHand.palm = palm;
    } else if (this.handTarget) {
      this.contact.reset();
      if (this.campTarget) this.actionHand.palm = null;
    }
    const mine = this.mine.sockets;
    mineVisualSockets.valid = mine.valid && !useWorldStore.getState().card;
    Object.assign(mineVisualSockets, { assetsReady: mine.assetsReady, contactError: mine.contactError,
      rightReachError: mine.rightReachError, leftReachError: mine.leftReachError,
      sampledActionKind: mine.sampledActionKind, sampledElapsed: mine.sampledElapsed });
    for (const key of ['leftHand', 'rightHand', 'headContact', 'scanOrigin', 'oreRelease'] as const)
      mineVisualSockets[key] = [...mine[key]];
  }

  debug() { return { mine: { ...this.mine.sockets } }; }

  dispose() {
    this.contact.reset();
    if (campPropHand.palm === this.contact.palm) campPropHand.palm = null;
    if (guideActionHand.palm === this.contact.palm) guideActionHand.palm = null;
    this.mine.dispose(); this.exchange.dispose(); this.inspection.dispose();
    if (ibdInspectionHands.left === this.inspection.arms?.left.palm) {
      ibdInspectionHands.left = null; ibdInspectionHands.right = null;
    }
    Object.assign(ibdInspectionVisualSockets, { valid: false, reachable: false, sampledId: null });
    Object.assign(exchangeVisualSockets, { valid: false, sampledId: null, contactError: Infinity });
    Object.assign(mineVisualSockets, { valid: false, assetsReady: false, sampledActionKind: null, sampledElapsed: 0 });
  }
}
