import { JsonRpcError, JsonRpcResponseResult, JsonRpcResponseError, JsonRpcEvent, JsonRpcRequest } from "@adt/json-rpc";
import EventEmitter from "@adt/event-emitter";
import MessageTracker from "@adt/message-tracker";

var version = "#version#";

/**
 * @constructor
 * @param {Object} c Configuration
 * @param {JsonRpcTransportProvider} c.transportProvider
 * @param {Number} [c.messageCheckInterval=1000] c.messageCheckInterval Interval (in ms) of checking overdue requests with no response
 * @param {Number} [c.messageTimeout=5000] Message timeout in milliseconds
 * @param {Boolean} [c.reconnect=false] Reconnect flag
 * @param {Number} [c.reconnectAfter=5000] Reconnect timeout in milliseconds
 * @fires connected
 * @fires connecting
 * @fires disconnected
 * @fires connectionerror
 * @fires message
 * @fires error
 */
export default function JsonRpcClient(c) {

    if (typeof c === "undefined" || c === null) {
        throw new Error("Missing configuration object");
    }

    if ( typeof c.transportProvider === "undefined") {
        throw new Error("Required param 'transportProvider' is not defined");
    }

    const that = this;
    const emitter = EventEmitter();

    const config = {
        messageCheckInterval : "messageCheckInterval" in c ? c.messageCheckInterval : 1000,
        messageTimeout : "messageTimeout" in c ? c.messageTimeout : 5000
    };
    const transportProvider = c.transportProvider;
    transportProvider.onMessage(onMessage.bind(that));
    const o = onDisconnect.bind(that);

    transportProvider.onDisconnect(o);

    const messageTracker = MessageTracker({
        timeout : config.messageTimeout,
        checkInterval : config.messageCheckInterval
    });

    const ret = Object.create(JsonRpcClient.prototype, /** @lends JsonRpcClient.prototype */ {

        version : { get : function(){
            return version;
        }},

        // TODO: Getter
        connected: {value: false, writable: true},

        /**
         * @type {WebSocket}
         * @default null
         */
        socket: {value: null, writable: true},

        /**
         * @type {MessageTracker}
         * @default null
         */
        messageTracker : { value : null, writable : true},

        connect: {value: connect},

        sendRequest: {value: sendRequest},

        sendEvent: { value : sendEvent},

        disconnect : { value : disconnect },

        on : { value : (evtName, cbf, context) => emitter.on(evtName, cbf, context)}

    });

    /**
     * Connects to remote endpoint by underlying transport channel
     * @name JsonRpcClient#connect
     * @function
     * @this JsonRpcClient
     * @return {Promise}
     */
    function connect() {

        return new Promise( (resolve, reject ) => {

            emitter.emit("connecting");
            transportProvider.connect().then( () => {

                emitter.emit("connected");

                resolve();

            }).catch( (e) => {

                reject(e);
            });

        });

    }

    /**
     * Send request to the remote side
     * If websocket is not connected then message will not be send and function returns rejected promise with JsonRpcClient.ERRORS.INVALID_STATE_ERR
     * If request will be timeouted during waiting from response then returned promise will be rejected with JsonRpcError.ERRORS.TIMEOUT_EXCEEDED with request attached in data property
     * @function
     * @name JsonRpcClient#sendRequest
     * @this JsonRpcClient
     * @param {JsonRpcClient.JsonRpcRequest} req
     * @param {Boolean} [enableCallbacks=false] If true, then callbacks assigned to message event will be executed before resolving/rejecting promise on response.
     * @return Promise
     */
    function sendRequest(req, enableCallbacks) {

        var retPromise,
            rejectWith = JsonRpcClient.ERRORS.TIMEOUT_EXCEEDED;
        rejectWith.data = req;

        if ( transportProvider.isConnected() === true ) {

            retPromise = messageTracker.register({
                message: req,
                filter : filterMessage,
                timeoutRejectWith : rejectWith,
                params : {
                    enableCallbacks: enableCallbacks
                },
                context : this
            });

            // TODO: Czy powinienem tutaj pchać zaserializowane, czy może jednak JsonRpcRequest??? Chyba lepiej mieć obiekt...
            transportProvider.send(req);

        } else {

            retPromise = Promise.reject(new JsonRpcResponseError({ id : req.id,
                error : JsonRpcClient.ERRORS.INVALID_STATE_ERR }) );
        }

        return retPromise;

    }

    /**
     * Sends JSON-RPC event to the remote side.
     * On success method returns JsonRpcClient.ERRORS.NO_ERROR
     * If websocket is not connected then message will not be send and function returns error JsonRpcClient.ERRORS.INVALID_STATE_ERR
     * @function
     * @name JsonRpcClient#sendEvent
     * @param {JsonRpcClient.JsonRpcEvent}
     * @this JsonRpcClient
     * @return JsonRpcError
     */
    function sendEvent(evt) {

        if ( transportProvider.isConnected() === true ) {

            transportProvider.send(evt);

        } else {

            return JsonRpcClient.ERRORS.INVALID_STATE_ERR;
        }

        return JsonRpcClient.ERRORS.NO_ERROR;

    }

    /**
     * @this JsonRpcClient
     * @param {JsonRpcElement}
     */
    function onMessage(m) {

        let msg,
            rObj = {};

        // If message tracker matched message, then eventually emit message is realized by filterFunction
        // otherwise process message as event or request here
        if ( !messageTracker.matchMessage(m) ) {

            if ( typeof m === "object" ) {
                
                if ("id" in m) {
                    rObj.id = m.id;

                    if ("result" in m) {
                        rObj.result = m.result;
                        msg = JsonRpcResponseResult(rObj);
                    }

                    if ("error" in m) {
                        msg = JsonRpcResponseError({
                            id: m.id,
                            error: JsonRpcError(m.error)
                        });
                    }

                    if ("method" in m) {
                        rObj.method = m.method;
                        rObj.params = m.params;
                        msg = JsonRpcRequest(rObj);
                    }

                } else {

                    rObj.method = m.method;
                    rObj.params = m.params;
                    msg = JsonRpcEvent(rObj);

                }
                
            }

            emitter.emit("message", msg);

        }

    }

    function onDisconnect(evt) {
        emitter.emit("disconnected",evt);
    }

    /**
     * Disconnects underlying transport channel.
     * @function
     * @name JsonRpcClient#disconnect
     * @this JsonRpcClient
     */
    function disconnect() {

        transportProvider.disconnect();
    }

    /**
     * Function for filter messages in MessageTracker.
     * This function is executed by message tracker in context of JsonRpcClient.
     *
     * @param {Object} o Parameters object
     * @param {JsonRpcElement} o.message Message passed to matchMessage method
     * @param {JsonRpcElement} o.current Iterated message from internal message register)
     * @param {Function} o.resolve Resolving function
     * @param {Function} o.reject Rejecting function
     * @param {Object} o.params Additional params
     * @this JsonRpcClient
     */
    function filterMessage(o) {
        
        const m = o?.message;
        
        if ( typeof m === "undefined" || m.id !== o.current.id ) {
            return;
        }
        
        let msg;

        let err = false;

        if ( "result" in m) {

            msg = JsonRpcResponseResult({
                id : m.id,
                result : m.result
            });

        }

        if ("error" in m ) {
            err = true;
            msg = JsonRpcResponseError({
                id : m.id,
                error : JsonRpcError(m.error)
            });
        }

        if ( msg !== undefined ) {

            if (o.params.enableCallbacks === true ) {
                emitter.emit("message", m);
            }

            if (err === true) {
                o.reject(msg);
            } else {
                o.resolve(msg);
            }

        }

    }

    return ret;

}

JsonRpcClient.ERRORS = Object.create(null,{

    NO_ERROR: { value : Object.create(JsonRpcError.prototype, {
        code: { value: -32000, enumerable : true },
        message: { value : "No error", enumerable : true },
        data  : { value : undefined, enumerable : true, writable : true }
    }),
    enumerable : true },

    TIMEOUT_EXCEEDED: { value : Object.create(JsonRpcError.prototype, {
        code: { value: -32001, enumerable : true },
        message: { value : "Waiting for response timeout exceeded", enumerable : true },
        data  : { value : undefined, enumerable : true, writable : true }
    }),
    enumerable : true },

    INVALID_STATE_ERR: { value : Object.create(JsonRpcError.prototype, {
        code: { value: -32002, enumerable : true },
        message: { value : "WebSocket is already in CLOSING or CLOSED state", enumerable : true },
        data  : { value : undefined, enumerable : true, writable : true}
    }),
    enumerable : true }
});
