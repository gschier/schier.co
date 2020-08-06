module.exports = {
  plugins: [
    require('postcss-import'),
    require('postcss-nested'),
    require('tailwindcss')({
      important: true,
      purge: false,
      theme: require('./tailwind/theme'),
    }),

    require('autoprefixer'), // Must be last
  ],
};
