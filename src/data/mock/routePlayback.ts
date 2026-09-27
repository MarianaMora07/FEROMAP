import type { DailyRoutePlaybackResponse } from '../../core/route-playback/routePlaybackTypes';
import { ROUTE_PLAYBACK_LANDFILL_CODE } from '../../core/route-playback/routePlaybackTypes';

const MOCK_ROUTES: DailyRoutePlaybackResponse['routes'] = [
  {
    routeId: 1,
    vehicleId: 8,
    vehicleLabel: 'TR-08',
    color: '#34D634',
    lineCoordinates: [
      [-62.715, 8.295],
      [-62.718, 8.296],
      [-62.721, 8.297],
      [-62.69, 8.28],
      [-62.724, 8.298],
      [-62.715, 8.295],
    ],
    stops: [
      {
        sequence: 1,
        lng: -62.718,
        lat: 8.296,
        code: 'CNT-001',
        serviceMinutes: 5,
        stopType: 'collection',
      },
      {
        sequence: 2,
        lng: -62.721,
        lat: 8.297,
        code: 'CNT-002',
        serviceMinutes: 5,
        stopType: 'collection',
      },
      {
        sequence: 3,
        lng: -62.69,
        lat: 8.28,
        code: ROUTE_PLAYBACK_LANDFILL_CODE,
        serviceMinutes: 15,
        stopType: 'landfill',
      },
      {
        sequence: 4,
        lng: -62.724,
        lat: 8.298,
        code: 'CNT-003',
        serviceMinutes: 5,
        stopType: 'collection',
      },
    ],
    totalDurationMinutes: 95,
    startTime: '2026-08-14T06:00:00+00:00',
  },
  {
    routeId: 2,
    vehicleId: 4,
    vehicleLabel: 'TR-04',
    color: '#1143F3',
    lineCoordinates: [
      [-62.715, 8.295],
      [-62.717, 8.297],
      [-62.712, 8.293],
      [-62.715, 8.295],
    ],
    stops: [
      {
        sequence: 1,
        lng: -62.717,
        lat: 8.297,
        code: 'CNT-010',
        serviceMinutes: 5,
        stopType: 'collection',
      },
      {
        sequence: 2,
        lng: -62.712,
        lat: 8.293,
        code: 'CNT-011',
        serviceMinutes: 5,
        stopType: 'collection',
      },
    ],
    totalDurationMinutes: 72,
    startTime: '2026-08-14T06:15:00+00:00',
  },
  {
    routeId: 3,
    vehicleId: 2,
    vehicleLabel: 'TR-02',
    color: '#7c3aed',
    lineCoordinates: [
      [-62.715, 8.295],
      [-62.719, 8.291],
      [-62.716, 8.286],
      [-62.715, 8.295],
    ],
    stops: [
      {
        sequence: 1,
        lng: -62.719,
        lat: 8.291,
        code: 'CNT-020',
        serviceMinutes: 5,
        stopType: 'collection',
      },
      {
        sequence: 2,
        lng: -62.716,
        lat: 8.286,
        code: 'CNT-021',
        serviceMinutes: 5,
        stopType: 'collection',
      },
    ],
    totalDurationMinutes: 68,
    startTime: '2026-08-14T06:30:00+00:00',
  },
];

export function mockDailyRoutePlayback(dailyPlanId: number): DailyRoutePlaybackResponse {
  return {
    dailyPlanId,
    operationDate: '2026-08-14',
    previewMode: true,
    routes: MOCK_ROUTES,
  };
}
