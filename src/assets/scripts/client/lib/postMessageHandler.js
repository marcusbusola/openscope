/**
 * PostMessage Handler for External Control
 *
 * Enables parent windows to control OpenScope via postMessage API.
 * Used when OpenScope is embedded in an iframe for research/integration purposes.
 */

import EventBus from './EventBus';
import { EVENT } from '../constants/eventNames';

/**
 * @class PostMessageHandler
 */
export default class PostMessageHandler {
    constructor(aircraftController, gameController) {
        console.log('[PostMessageHandler] Initializing external control listener');

        this.aircraftController = aircraftController;
        this.gameController = gameController;
        this.isReady = false;
        this.parentOrigin = null; // Will be set from first message

        this._setupEventListeners();
    }

    /**
     * Set up event listeners for postMessage communication
     */
    _setupEventListeners() {
        window.addEventListener('message', (event) => {
            // Security: Store parent origin from first message
            if (!this.parentOrigin && event.origin) {
                this.parentOrigin = event.origin;
                console.log('[PostMessageHandler] Parent origin set to:', event.origin);
            }

            this._handleMessage(event);
        });

        // Listen for OpenScope ready event
        EventBus.on(EVENT.AIRPORT_CHANGE, () => {
            if (!this.isReady) {
                this.isReady = true;
                this._sendReadyMessage();
            }
        });
    }

    /**
     * Send ready message to parent window
     */
    _sendReadyMessage() {
        console.log('[PostMessageHandler] Sending ready message to parent');
        this._sendMessage({
            type: 'openscope:ready',
            data: {
                ready: true,
                timestamp: Date.now()
            }
        });
    }

    /**
     * Handle incoming messages from parent window
     */
    _handleMessage(event) {
        const { data } = event;

        if (!data || !data.type) {
            return; // Ignore non-OpenScope messages
        }

        console.log('[PostMessageHandler] Received command:', data.type, data);

        try {
            switch (data.type) {
                case 'openscope:ping':
                    this._handlePing(data);
                    break;

                case 'openscope:spawn':
                    this._handleSpawn(data);
                    break;

                case 'openscope:despawn':
                    this._handleDespawn(data);
                    break;

                case 'openscope:despawnAll':
                    this._handleDespawnAll(data);
                    break;

                case 'openscope:command':
                    this._handleCommand(data);
                    break;

                case 'openscope:getState':
                    this._handleGetState(data);
                    break;

                case 'openscope:pause':
                    this._handlePause(data);
                    break;

                case 'openscope:resume':
                    this._handleResume(data);
                    break;

                case 'openscope:timewarp':
                    this._handleTimewarp(data);
                    break;

                default:
                    console.warn('[PostMessageHandler] Unknown message type:', data.type);
            }
        } catch (error) {
            console.error('[PostMessageHandler] Error handling message:', error);
            this._sendError(data.messageId, error.message);
        }
    }

    /**
     * Handle ping command
     */
    _handlePing(data) {
        this._sendResponse(data.messageId, {
            success: true,
            ready: this.isReady,
            timestamp: Date.now()
        });
    }

    /**
     * Handle spawn aircraft command
     */
    _handleSpawn(data) {
        const { callsign, type, altitude, heading, speed, position } = data.payload || data;

        console.log('[PostMessageHandler] Spawn request received for:', callsign);
        console.log('[PostMessageHandler] Aircraft props:', { type, altitude, heading, speed, position });

        if (!this.aircraftController) {
            this._sendError(data.messageId, 'Aircraft controller not available');
            return;
        }

        try {
            // Create initialization props for the aircraft
            // Based on OpenScope's aircraft initialization format
            const initProps = {
                callsign: callsign,
                aircraftType: type || 'B737',
                destination: '',  // Will use default
                altitude: altitude || 10000,
                speed: speed || 250,
                heading: heading || 0
            };

            // If position is provided, add it
            if (position && position.lat !== undefined && position.lon !== undefined) {
                initProps.positionModel = {
                    latitude: position.lat,
                    longitude: position.lon
                };
            }

            console.log('[PostMessageHandler] Creating aircraft with props:', initProps);

            // Use the aircraftController's internal method to create aircraft
            // This is the same method used by spawn patterns
            this.aircraftController._createAircraftWithInitializationProps(initProps);

            this._sendResponse(data.messageId, {
                success: true,
                callsign: callsign,
                message: `Spawned ${callsign}`
            });
        } catch (error) {
            console.error('[PostMessageHandler] Spawn error:', error);
            this._sendError(data.messageId, error.message);
        }
    }

    /**
     * Handle despawn aircraft command
     */
    _handleDespawn(data) {
        const { callsign } = data.payload || data;

        if (!this.aircraftController) {
            this._sendError(data.messageId, 'Aircraft controller not available');
            return;
        }

        try {
            // Find the aircraft by callsign
            const aircraft = this.aircraftController.findAircraftByCallsign(callsign);

            if (aircraft) {
                // Remove the aircraft
                this.aircraftController.aircraft_remove(aircraft);

                this._sendResponse(data.messageId, {
                    success: true,
                    callsign: callsign
                });
            } else {
                this._sendError(data.messageId, `Aircraft ${callsign} not found`);
            }
        } catch (error) {
            this._sendError(data.messageId, error.message);
        }
    }

    /**
     * Handle despawn all aircraft command
     */
    _handleDespawnAll(data) {
        if (!this.aircraftController) {
            this._sendError(data.messageId, 'Aircraft controller not available');
            return;
        }

        try {
            // Get all aircraft and remove them
            const aircraftList = [...this.aircraftController.aircraft.list]; // Copy array
            const count = aircraftList.length;

            aircraftList.forEach(aircraft => {
                this.aircraftController.aircraft_remove(aircraft);
            });

            this._sendResponse(data.messageId, {
                success: true,
                count: count
            });
        } catch (error) {
            this._sendError(data.messageId, error.message);
        }
    }

    /**
     * Handle generic command
     */
    _handleCommand(data) {
        const { command } = data.payload || data;

        // Commands not supported in this simplified version
        this._sendError(data.messageId, 'Generic commands not yet supported');
    }

    /**
     * Handle get state command
     */
    _handleGetState(data) {
        if (!this.aircraftController) {
            this._sendError(data.messageId, 'Aircraft controller not available');
            return;
        }

        try {
            const state = {
                aircraft: this.aircraftController.aircraft.list.map(ac => ({
                    callsign: ac.callsign,
                    altitude: ac.altitude,
                    heading: ac.heading,
                    speed: ac.speed,
                    position: {
                        lat: ac.positionModel ? ac.positionModel.latitude : null,
                        lon: ac.positionModel ? ac.positionModel.longitude : null
                    }
                })),
                timestamp: Date.now()
            };

            this._sendResponse(data.messageId, {
                success: true,
                state: state
            });
        } catch (error) {
            this._sendError(data.messageId, error.message);
        }
    }

    /**
     * Handle pause command
     */
    _handlePause(data) {
        // Pause not implemented - send success anyway
        this._sendResponse(data.messageId, { success: true });
    }

    /**
     * Handle resume command
     */
    _handleResume(data) {
        // Resume not implemented - send success anyway
        this._sendResponse(data.messageId, { success: true });
    }

    /**
     * Handle timewarp command
     */
    _handleTimewarp(data) {
        const { speed } = data.payload || data;
        // Timewarp not implemented - send success anyway
        this._sendResponse(data.messageId, { success: true, speed: speed });
    }

    /**
     * Send response message to parent window
     */
    _sendResponse(messageId, data) {
        this._sendMessage({
            type: 'openscope:response',
            messageId: messageId,
            data: data
        });
    }

    /**
     * Send error message to parent window
     */
    _sendError(messageId, errorMessage) {
        this._sendMessage({
            type: 'openscope:error',
            messageId: messageId,
            error: errorMessage
        });
    }

    /**
     * Send message to parent window
     */
    _sendMessage(message) {
        if (window.parent && window.parent !== window) {
            const targetOrigin = this.parentOrigin || '*';
            window.parent.postMessage(message, targetOrigin);
        }
    }
}
