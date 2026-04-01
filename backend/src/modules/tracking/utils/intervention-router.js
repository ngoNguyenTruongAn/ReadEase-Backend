/**
 * Intervention Router
 *
 * Routes ML cognitive state results to appropriate WebSocket events.
 *
 * Routing rules:
 *   REGRESSION  → adaptation:trigger (VISUAL) + tooltip:show
 *   DISTRACTION → adaptation:trigger (VISUAL only)
 *   FLUENT      → no intervention
 */

/**
 * Route ML result to WebSocket intervention events.
 * Sends events directly to the client via raw WebSocket.
 *
 * @param {WebSocket} client - WebSocket client connection
 * @param {object} mlResult - { state, confidence, session_id, source, simplified, original }
 * @param {object} [lastPoint] - latest mouse point ({x, y, timestamp, word_index})
 * @returns {string|null} The intervention type applied, or null if none
 */
function routeIntervention(client, mlResult, lastPoint = null) {
  if (!client || client.readyState !== 1) {
    return null;
  }

  const { state, confidence, session_id } = mlResult;
  const cursorX = Number.isFinite(lastPoint?.x) ? lastPoint.x : null;
  const cursorY = Number.isFinite(lastPoint?.y) ? lastPoint.y : null;
  const wordIndex = Number.isInteger(lastPoint?.word_index)
    ? lastPoint.word_index
    : Number.isInteger(lastPoint?.wordIndex)
      ? lastPoint.wordIndex
      : null;

  switch (state) {
    case 'REGRESSION':
      // Send visual intervention config for FE CSS engine.
      client.send(
        JSON.stringify({
          event: 'adaptation:trigger',
          data: {
            type: 'VISUAL',
            mode: 'DUAL_INTERVENTION',
            state,
            confidence,
            session_id,
            params: {
              letterSpacing: '0.08em',
              colorBanding: true,
              transition: {
                durationMs: 200,
                easing: 'ease-in-out',
              },
            },
            timestamp: Date.now(),
          },
        }),
      );

      // Send semantic intervention payload for tooltip renderer.
      client.send(
        JSON.stringify({
          event: 'tooltip:show',
          data: {
            type: 'SEMANTIC',
            mode: 'DUAL_INTERVENTION',
            state,
            confidence,
            session_id,
            wordIndex,
            cursorX,
            cursorY,
            original: mlResult.original || null,
            simplified: mlResult.simplified || null,
            timestamp: Date.now(),
          },
        }),
      );

      return 'DUAL';

    case 'DISTRACTION':
      // Send adaptation trigger (visual only)
      client.send(
        JSON.stringify({
          event: 'adaptation:trigger',
          data: {
            type: 'VISUAL',
            mode: 'VISUAL_ONLY',
            state,
            confidence,
            session_id,
            params: {
              letterSpacing: '0.05em',
              colorBanding: false,
              transition: {
                durationMs: 200,
                easing: 'ease-in-out',
              },
            },
            timestamp: Date.now(),
          },
        }),
      );

      return 'VISUAL';

    case 'FLUENT':
    default:
      // No intervention needed
      return null;
  }
}

module.exports = { routeIntervention };
