import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, PanResponder } from 'react-native';
import { useAnchorStore } from '@/store/anchorStore';
import { TIDE_API_CONFIGURED } from '@/config/tideApi';

const SLIDER_MIN = 5;
const SLIDER_MAX = 200;

interface RadiusControlProps {
  onDrawZone: () => void;
}

export function RadiusControl({ onDrawZone }: RadiusControlProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const twRef = useRef(0);

  const {
    watchRadius, setWatchRadius, customZone, setCustomZone,
    tideEnabled, tideAutoMode, anchorTideHeight, currentTideHeight, tideData,
    setTideEnabled, setTideAutoMode, setAnchorTideHeight, setCurrentTideHeight,
  } = useAnchorStore();

  const hasZone = customZone !== null && customZone.length >= 3;

  // Radius scrubber
  const pct = Math.max(0, Math.min(1, (watchRadius - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)));
  const fillW = trackWidth * pct;
  const thumbL = Math.max(0, Math.min(trackWidth - 20, fillW - 10));

  const scrubRadius = (x: number) => {
    if (twRef.current === 0) return;
    const clamped = Math.max(0, Math.min(twRef.current, x));
    const r = Math.round(SLIDER_MIN + (clamped / twRef.current) * (SLIDER_MAX - SLIDER_MIN));
    setWatchRadius(r);
  };

  const radiusPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => scrubRadius(e.nativeEvent.locationX),
    onPanResponderMove: (e) => scrubRadius(e.nativeEvent.locationX),
  })).current;

  const tideOffset = Math.round((anchorTideHeight - currentTideHeight) * 10) / 10;
  const effectiveRadius = tideEnabled ? Math.max(5, watchRadius + tideOffset) : watchRadius;
  const offsetSign = tideOffset >= 0 ? '+' : '';

  const TideStepper = ({ label, value, onChange }: {
    label: string;
    value: number;
    onChange: (v: number) => void;
  }) => (
    <View style={styles.tideRow}>
      <Text style={styles.tideRowLabel}>{label}</Text>
      <View style={styles.tideStepRow}>
        <TouchableOpacity style={styles.tideStep} onPress={() => onChange(Math.round((value - 1) * 10) / 10)}>
          <Text style={styles.tideStepText}>−1</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tideStep} onPress={() => onChange(Math.round((value - 0.1) * 10) / 10)}>
          <Text style={styles.tideStepText}>−.1</Text>
        </TouchableOpacity>
        <View style={styles.tideValueBox}>
          <Text style={styles.tideValueText}>{value >= 0 ? '+' : ''}{value.toFixed(1)}</Text>
          <Text style={styles.tideUnit}>m</Text>
        </View>
        <TouchableOpacity style={styles.tideStep} onPress={() => onChange(Math.round((value + 0.1) * 10) / 10)}>
          <Text style={styles.tideStepText}>+.1</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tideStep} onPress={() => onChange(Math.round((value + 1) * 10) / 10)}>
          <Text style={styles.tideStepText}>+1</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const TideOffsetSummary = () => (
    <View style={styles.tideOffsetSummary}>
      <Text style={styles.tideOffsetText}>
        OFFSET {offsetSign}{tideOffset.toFixed(1)}m{'  →  '}EFFECTIVE RADIUS: {effectiveRadius.toFixed(1)}m
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>

      {hasZone ? (
        /* Custom zone is active */
        <View style={styles.zoneActive}>
          <View style={styles.zoneActiveRow}>
            <View style={styles.zoneActiveDot} />
            <Text style={styles.zoneActiveLabel}>CUSTOM ZONE ACTIVE</Text>
            <Text style={styles.zonePoints}>{customZone!.length} points</Text>
          </View>
          <Text style={styles.zoneHint}>Alarm fires when boat leaves your drawn zone</Text>
          <View style={styles.zoneActions}>
            <TouchableOpacity style={styles.redrawBtn} onPress={onDrawZone}>
              <Text style={styles.redrawBtnText}>REDRAW</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.clearZoneBtn} onPress={() => setCustomZone(null)}>
              <Text style={styles.clearZoneBtnText}>CLEAR ZONE</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        /* Circle radius controls */
        <>
          <Text style={styles.label}>DRAG RADIUS</Text>

          <View style={styles.row}>
            <TouchableOpacity style={styles.stepBtn} onPress={() => setWatchRadius(watchRadius - 10)}>
              <Text style={styles.stepBtnText}>−10</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.stepBtn} onPress={() => setWatchRadius(watchRadius - 1)}>
              <Text style={styles.stepBtnText}>−1</Text>
            </TouchableOpacity>

            <View style={styles.valueBox}>
              <Text style={styles.valueText}>{watchRadius}</Text>
              <Text style={styles.unitText}>m</Text>
            </View>

            <TouchableOpacity style={styles.stepBtn} onPress={() => setWatchRadius(watchRadius + 1)}>
              <Text style={styles.stepBtnText}>+1</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.stepBtn} onPress={() => setWatchRadius(watchRadius + 10)}>
              <Text style={styles.stepBtnText}>+10</Text>
            </TouchableOpacity>
          </View>

          {/* Radius scrubber */}
          <View
            style={styles.scrubArea}
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              setTrackWidth(w);
              twRef.current = w;
            }}
            {...radiusPan.panHandlers}
          >
            <View style={styles.trackBg}>
              <View style={[styles.trackFill, { width: fillW }]} />
            </View>
            {trackWidth > 0 && <View style={[styles.thumb, { left: thumbL }]} />}
          </View>
          <View style={styles.scrubLabels}>
            <Text style={styles.scrubLabel}>{SLIDER_MIN}m</Text>
            <Text style={styles.scrubLabel}>{SLIDER_MAX}m</Text>
          </View>

          <TouchableOpacity style={styles.drawZoneBtn} onPress={onDrawZone}>
            <Text style={styles.drawZoneBtnText}>DRAW CUSTOM ZONE</Text>
            <Text style={styles.drawZoneBtnSub}>Tap points on map to set a custom shape</Text>
          </TouchableOpacity>

          {/* ── Tide offset ── */}
          <View style={styles.tideSection}>
            <View style={styles.tideTitleRow}>
              <Text style={styles.label}>TIDE OFFSET</Text>
              <View style={styles.tideTitleRight}>
                {tideEnabled && (
                  <TouchableOpacity
                    style={[styles.tideModeBtn, tideAutoMode && styles.tideModeBtnAuto]}
                    onPress={() => setTideAutoMode(!tideAutoMode)}
                  >
                    <Text style={[styles.tideModeBtnText, tideAutoMode && styles.tideModeBtnTextAuto]}>
                      {tideAutoMode ? 'AUTO' : 'MANUAL'}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.tideToggle, tideEnabled && styles.tideToggleActive]}
                  onPress={() => setTideEnabled(!tideEnabled)}
                >
                  <Text style={[styles.tideToggleText, tideEnabled && styles.tideToggleTextActive]}>
                    {tideEnabled ? 'ON' : 'OFF'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {tideEnabled && (
              tideAutoMode ? (
                /* ── Auto mode ── */
                !TIDE_API_CONFIGURED ? (
                  <View style={styles.tideApiWarning}>
                    <Text style={styles.tideApiWarningTitle}>API KEY REQUIRED</Text>
                    <Text style={styles.tideApiWarningText}>
                      Add your WorldTides key to{'\n'}src/config/tideApi.ts{'\n'}Free at worldtides.info/developer
                    </Text>
                  </View>
                ) : !tideData ? (
                  <View style={styles.tideAutoStatus}>
                    <Text style={styles.tideAutoStatusText}>FETCHING TIDE DATA...</Text>
                    <Text style={styles.tideAutoStatusSub}>Requires GPS fix</Text>
                  </View>
                ) : (
                  <>
                    <View style={styles.tideAutoReadout}>
                      <View style={styles.tideAutoItem}>
                        <Text style={styles.tideAutoItemLabel}>WHEN ANCHORED</Text>
                        <Text style={styles.tideAutoItemValue}>
                          {anchorTideHeight >= 0 ? '+' : ''}{anchorTideHeight.toFixed(1)}m
                        </Text>
                      </View>
                      <View style={styles.tideAutoSep} />
                      <View style={styles.tideAutoItem}>
                        <Text style={styles.tideAutoItemLabel}>CURRENT</Text>
                        <Text style={styles.tideAutoItemValue}>
                          {currentTideHeight >= 0 ? '+' : ''}{currentTideHeight.toFixed(1)}m
                        </Text>
                      </View>
                    </View>
                    <TideOffsetSummary />
                  </>
                )
              ) : (
                /* ── Manual mode ── */
                <>
                  <TideStepper
                    label="ANCHOR TIDE HEIGHT"
                    value={anchorTideHeight}
                    onChange={setAnchorTideHeight}
                  />
                  <TideStepper
                    label="CURRENT TIDE HEIGHT"
                    value={currentTideHeight}
                    onChange={setCurrentTideHeight}
                  />
                  <TideOffsetSummary />
                </>
              )
            )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0f2040',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: '#1e3a6e',
    gap: 12,
  },
  label: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#162d57',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1e3a6e',
  },
  stepBtnText: {
    color: '#f1f5f9',
    fontSize: 22,
    lineHeight: 26,
  },
  valueBox: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    minWidth: 80,
    justifyContent: 'center',
  },
  valueText: {
    color: '#C9A227',
    fontSize: 32,
    fontWeight: '700',
  },
  unitText: {
    color: '#64748b',
    fontSize: 16,
  },
  scrubArea: {
    height: 40,
    justifyContent: 'center',
  },
  trackBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 17,
    height: 6,
    backgroundColor: '#1e3a6e',
    borderRadius: 3,
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    backgroundColor: '#C9A227',
    borderRadius: 3,
  },
  thumb: {
    position: 'absolute',
    top: 10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#C9A227',
    borderWidth: 2.5,
    borderColor: '#0f2040',
  },
  scrubLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
  },
  scrubLabel: {
    color: '#334155',
    fontSize: 10,
    fontFamily: 'monospace',
  },

  drawZoneBtn: {
    backgroundColor: '#162d57',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3b82f6',
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 2,
  },
  drawZoneBtnText: {
    color: '#3b82f6',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  drawZoneBtnSub: {
    color: '#475569',
    fontSize: 10,
  },

  // Tide offset section
  tideSection: {
    borderTopWidth: 1,
    borderTopColor: '#1e3a6e',
    paddingTop: 12,
    gap: 10,
  },
  tideTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tideTitleRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tideModeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#162d57',
  },
  tideModeBtnAuto: {
    borderColor: '#38bdf8',
    backgroundColor: '#38bdf811',
  },
  tideModeBtnText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  tideModeBtnTextAuto: {
    color: '#38bdf8',
  },
  tideToggle: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#162d57',
  },
  tideToggleActive: {
    borderColor: '#10b981',
    backgroundColor: '#10b98122',
  },
  tideToggleText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  tideToggleTextActive: {
    color: '#10b981',
  },

  // Auto mode readout
  tideAutoReadout: {
    flexDirection: 'row',
    backgroundColor: '#162d57',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1e3a6e',
    overflow: 'hidden',
  },
  tideAutoItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    gap: 4,
  },
  tideAutoSep: {
    width: 1,
    backgroundColor: '#1e3a6e',
  },
  tideAutoItemLabel: {
    color: '#475569',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  tideAutoItemValue: {
    color: '#38bdf8',
    fontSize: 22,
    fontWeight: '700',
  },
  tideAutoStatus: {
    backgroundColor: '#162d57',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1e3a6e',
    paddingVertical: 12,
    alignItems: 'center',
    gap: 4,
  },
  tideAutoStatusText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  tideAutoStatusSub: {
    color: '#334155',
    fontSize: 10,
  },
  tideApiWarning: {
    backgroundColor: '#1a0a00',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f59e0b44',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 4,
  },
  tideApiWarningTitle: {
    color: '#C9A227',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  tideApiWarningText: {
    color: '#64748b',
    fontSize: 10,
    lineHeight: 16,
  },

  // Manual mode steppers
  tideRow: { gap: 6 },
  tideRowLabel: {
    color: '#475569',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
  },
  tideStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  tideStep: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#162d57',
    borderWidth: 1,
    borderColor: '#1e3a6e',
    minWidth: 42,
    alignItems: 'center',
  },
  tideStepText: {
    color: '#f1f5f9',
    fontSize: 12,
    fontWeight: '600',
  },
  tideValueBox: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
    minWidth: 64,
    justifyContent: 'center',
  },
  tideValueText: {
    color: '#38bdf8',
    fontSize: 22,
    fontWeight: '700',
  },
  tideUnit: {
    color: '#64748b',
    fontSize: 13,
  },
  tideOffsetSummary: {
    backgroundColor: '#162d57',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#1e3a6e',
    paddingVertical: 7,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  tideOffsetText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  zoneActive: { gap: 8 },
  zoneActiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  zoneActiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3b82f6',
  },
  zoneActiveLabel: {
    color: '#3b82f6',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    flex: 1,
  },
  zonePoints: {
    color: '#475569',
    fontSize: 10,
  },
  zoneHint: {
    color: '#475569',
    fontSize: 11,
  },
  zoneActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  redrawBtn: {
    flex: 1,
    backgroundColor: '#162d57',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3b82f6',
    paddingVertical: 9,
    alignItems: 'center',
  },
  redrawBtnText: {
    color: '#3b82f6',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  clearZoneBtn: {
    flex: 1,
    backgroundColor: '#162d57',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    paddingVertical: 9,
    alignItems: 'center',
  },
  clearZoneBtnText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
