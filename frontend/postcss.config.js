const { colors } = require('tailwindcss/defaultTheme');

module.exports = {
  plugins: [
    require('autoprefixer'),
    require('tailwindcss')({
      important: true,
      theme: {
        colors: {
          primary: { ...colors.blue, '50': '#f5fbff' },
          background: colors.white,
          foreground: colors.gray['800'],
          danger: colors.red,
          warning: colors.orange,
          notice: colors.yellow,
          info: colors.blue,
          gray: colors.gray,
          transparent: 'transparent',
        },
        textColor: {
          gray: colors.gray,
          inverted: colors.gray['200'],
          primary: colors.gray['700'],
          secondary: colors.blue['600'],
          notice: colors.yellow['700'],
          warning: colors.orange['600'],
          danger: colors.red['600'],
          info: colors.blue['600'],
          syntax1: colors.purple['600'],
          syntax2: colors.blue['600'],
          syntax3: colors.indigo['600'],
          syntax4: colors.gray['600'],
        },
        opacity: {
          '0': '0',
          '10': '.1',
          '20': '.2',
          '30': '.3',
          '40': '.4',
          '50': '.5',
          '60': '.6',
          '70': '.7',
          '80': '.8',
          '90': '.9',
          '100': '1',
        },
      },
    }),
  ],
};
