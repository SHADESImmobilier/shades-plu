// Config Babel pour Expo SDK 51.
// Depuis SDK 50+, le plugin `expo-router/babel` est intégré à `babel-preset-expo`
// (ne pas l'ajouter séparément). Ajoutez ici les plugins additionnels au besoin.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
  };
};
