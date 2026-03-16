/**
 * Intervention Router
 *
 * Routes ML cognitive state results to appropriate WebSocket events.
 *
 * Routing rules:
 *   REGRESSION  → adaptation:trigger (SEMANTIC) + tooltip:show
 *   DISTRACTION → adaptation:trigger (VISUAL only)
 *   FLUENT      → no intervention
 */

/**
 * Route ML result to WebSocket intervention events.
 * Sends events directly to the client via raw WebSocket.
 *
 * @param {WebSocket} client - WebSocket client connection
 * @param {object} mlResult - { state, confidence, session_id, source }
 * @returns {string|null} The intervention type applied, or null if none
 */
function routeIntervention(client, mlResult) {
  if (!client || client.readyState !== 1) {
    return null;
  }

  const { state, confidence, session_id } = mlResult;

  switch (state) {
    case 'REGRESSION':
      // Send adaptation trigger (semantic)
      client.send(
        JSON.stringify({
          event: 'adaptation:trigger',
          data: {
            type: 'SEMANTIC',
            state,
            confidence,
            session_id,
            timestamp: Date.now(),
          },
        }),
      );

      // Also send tooltip:show for semantic intervention
      client.send(
        JSON.stringify({
          event: 'tooltip:show',
          data: {
            type: 'SEMANTIC',
            state,
            confidence,
            session_id,
            timestamp: Date.now(),
          },
        }),
      );

      return 'SEMANTIC';

    case 'DISTRACTION':
      // Send adaptation trigger (visual only)
      client.send(
        JSON.stringify({
          event: 'adaptation:trigger',
          data: {
            type: 'VISUAL',
            state,
            confidence,
            session_id,
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
