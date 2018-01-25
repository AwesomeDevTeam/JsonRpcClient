// https://github.com/rollup/rollup-starter-lib/blob/master/rollup.config.js
import resolve from "rollup-plugin-node-resolve";
import commonjs from "rollup-plugin-commonjs";
import babel from "rollup-plugin-babel";
import pkg from "./package.json";

export default [
    // browser-friendly UMD build
    {
        input: "src/JsonRpcClient.js",
        output: {
            file: pkg.browser,
            format: "umd"
        },
        name: "JsonRpcClient",
        plugins: [
            resolve(),
            commonjs(),
            babel({
                exclude: "node_modules/**"
            })
        ],
        noConflict : true
    },
    // CommonJS (for Node) and ES module (for bundlers) build.
    // (We could have three entries in the configuration array
    // instead of two, but it's quicker to generate multiple
    // builds from a single configuration where possible, using
    // an array for the `output` option, where we can specify
    // `file` and `format` for each target)
    {
        input: "src/JsonRpcClient.js",
        output: [

            { file: pkg.main, format: "cjs" },
            { file: pkg.module, format: "es" }
        ],
        // Dont want to bundle
        external : [
            "@adt/json-rpc",
            "@adt/json-rpc-transport-providers",
            "@adt/message-tracker",
            "@adt/event-emitter"

        ],
        plugins: [
            resolve(),
            commonjs()
        ]
    }

];
