// babel.config.js (create at project root: client/babel.config.js)
module.exports = function (api) {
    api.cache(true);
    return {
      presets: [
        ["babel-preset-expo", { jsxImportSource: "nativewind" }],
        "nativewind/babel",
      ],
      plugins: ["react-native-reanimated/plugin"], // must stay last
    };
  };