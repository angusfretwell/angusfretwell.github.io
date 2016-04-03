var dayNames = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
];

function today() {
    var now = new Date();
    return dayNames[now.getDay()];
};

var elements = document.querySelectorAll('.weekday');

Array.prototype.forEach.call(elements, function(el) {
  el.textContent = today().toLowerCase();
});
