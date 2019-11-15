const { colors } = require('tailwindcss/defaultTheme');

module.exports = {
  important: true,
  theme: {
    colors: {
      primary: colors.blue,
      secondary: colors.pink,
      background: colors.white,
      foreground: colors.gray['900'],
      gray: colors.gray,
    },
  },
};
