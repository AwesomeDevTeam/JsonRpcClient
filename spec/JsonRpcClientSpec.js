const providers = require("@adt/json-rpc-transport-providers");
const DummyTransportProvider = providers.DummyTransportProvider;
const JsonRpcClient = require("../dist/JsonRpcClient.cjs");
const JsonRpc = require("@adt/json-rpc");

// Suite
describe("JsonRpcClient", function() {

    var dummyTransportProvider,
        defaultClient;

    function prepare() {

        dummyTransportProvider = DummyTransportProvider({
            onMessage : function(){},
            onDisconnect : function(){},
            onError : function(){}
        });

        defaultClient = JsonRpcClient({
            transportProvider : dummyTransportProvider,
            messageTimeout : 2
        });

    }

    beforeAll(prepare);

    /*beforeEach(function() {
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;
    });*/

    it("defaultClient must be instance of JsonRpcClient", function() {

        expect(defaultClient instanceof JsonRpcClient).toBe(true);

    });

    it("defaultClient.connect must return resolved Promise", function (done) {

            defaultClient.connect().then(

                () => expect(true).toBe(true)

            ).then( () => done() ).catch( e => fail(e) );

    });

    it("defaultClient.sendRequest must return promise", function(done){

        const req = JsonRpc.JsonRpcRequest( { method : "test",
            params : [],
            id : "1" } );

        defaultClient.sendRequest(req).then(

            () => expect(true).toBe(true)

        ).then( () => done()).catch( e => done() );

    });

    it("defaultClient.sendRequest must reject returned promise after timeout", function(done){

        const req = JsonRpc.JsonRpcRequest( { method : "test",
                                              params : [],
                                              id : "1" } );

       defaultClient.sendRequest(req).then(
           v => fail("Promise should not be resolved")
       ).catch(
           (e) => {
               expect(e).toBe(JsonRpcClient.ERRORS.TIMEOUT_EXCEEDED);
               done();
           }
       );

    });

    // Jak zrobić, żeby sprawdzic,m czy zwracam po otrzymaniu wiadomości?
    // Chyba na dummy providerze sie da???

    // TODO: todo sprawdzić metodę sendEvent
    /*it("defaultClient.sendEvent must return JsonRpcError", function() {

    });*/


    // TODO: sprawdzić metodę disconnect
    // TODO: Sprawdzić property isConnected


});
