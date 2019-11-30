const { colors } = require('tailwindcss/defaultTheme');

module.exports = {
  important: true,
  theme: {
    colors: {
      primary: colors.blue,
      background: colors.white,
      foreground: colors.gray['800'],
      gray: colors.gray,
    },
    textColor: {
      inverted: colors.gray['200'],
      primary: colors.gray['700'],
      secondary: colors.blue['500'],
      danger: colors.red['500'],
      gray: colors.gray,
    }
  },
};
