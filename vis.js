(function(){

var totalUsers = 200;
var numUsers = 100;
var activeUsersArr = [];
var minGroupCount = 200;
var passiveText;

var margin = {top: 10, right: 10, bottom: 10, left: 10},
	padding = {top: 10, right: 10, bottom: 10, left: 10},
	width = window.innerWidth - margin.right - margin.left,
    height = window.innerHeight - margin.top - margin.bottom,
	brushHeight = 60;

var playButton = d3.select("#g-play-button");

//var color = d3.scale.category20c();
//var color = d3.scale.ordinal().range(["#f7fcfd","#e0ecf4","#bfd3e6","#9ebcda","#8c96c6","#8c6bb1"]); //Blue-Purple - ["#f7fcfd","#e0ecf4","#bfd3e6","#9ebcda","#8c96c6","#8c6bb1","#88419d","#810f7c","#4d004b"]
var color = d3.scale.ordinal().range(["#ffffcc","#ffeda0","#fed976","#feb24c"]); //Yellow-Orange-Red - ["#ffffcc","#ffeda0","#fed976","#feb24c","#fd8d3c","#fc4e2a","#e31a1c","#bd0026","#800026"

//var color = d3.scale.ordinal().range(["#ffffff","#f0f0f0","#d9d9d9","#bdbdbd","#969696","#737373"]); //Greys: "#ffffff","#f0f0f0","#d9d9d9","#bdbdbd","#969696","#737373","#525252","#252525","#000000"
var slider,
	moving, //Indicates whether movement is currently ongoing or paused
	minValue,
    maxValue,
    currentValue,
    targetValue,
	alpha = 0.25,
    handle;

var formatTime = d3.format(".0f");

var svg = d3.select(".g-graphic").append("svg")
    .attr("width", width)
    .attr("height", height);

svg.append("rect")
    .attr("class", "g-background")
    .attr("width", width)
    .attr("height", height + 1);
	
var x = d3.scale.linear()
    .range([110, width - 40])
    .clamp(true);

var xTicks = {
  "0": "Start",
  "4320": "End"
};

var xAxis = d3.svg.axis()
    .scale(x)
    .orient("bottom")
    .tickFormat(function(t) { return  xTicks[t] || ("Day " + formatTime(t / 144));})
    .tickSize(12, 0)
    .tickPadding(0);
	
var brush = d3.svg.brush()
    .x(x)
    .extent([0, 0])
    .on("brush", brushed);
	
d3.queue()
    .defer(d3.json, "groups.json")
	.defer(d3.json, "posts.json")
    .await(ready);

var treemap = d3.layout.treemap()
    .size([width - padding.right - padding.left, height - padding.top - padding.bottom - brushHeight])
    .sticky(true)
	.padding(1)
    .value(function(d) {
		if(d.count > minGroupCount){
			return d.count; 
		}
	})
	.children(function(d){return d.values});
	
var nest = d3.nest()
    .key(function(d) { return d.category; });
	
var categoryCenterMap = d3.map();
var categorySizeMap = d3.map();

//Swarm Data
var swarmData = d3.range(numUsers).map(function() {
  return {xloc: 0, yloc: 0, xvel: 0, yvel: 0, count: 0};
});

var swarmNode;
var postData;

var swarmX = d3.scale.linear()
    .domain([-5, 5])
    .range([padding.left, width - padding.right - padding.left]);

var swarmRad = d3.scale.linear()
    .range([3, 20]);

var swarmY = d3.scale.linear()
    .domain([-5, 5])
    .range([brushHeight + padding.top, height - padding.top - padding.bottom - brushHeight]);

var time0 = Date.now(),
    time1;

//Main function executed after all related data is available
function ready(error, groups, posts) {
	minValue = 0;
	maxValue = targetValue = currentValue = 4320;	//6 * 24 hours * 30 days [Data at 10 minute intervals]
	
    x.domain([minValue, maxValue]);
    xAxis.tickValues(d3.range(0, targetValue, 288).concat(d3.keys(xTicks)));
	
	//Sorting post data based on time0
	for (var i=0; i<posts.length; i++){
		var post = posts[i];
		var postArr = post['posts'];
		postArr.sort(function(a, b){
			return a['t']-b['t'];
		})
	}
	
	postData = posts;
	var maxPosts = d3.max(postData, function(d) { 
		return d['posts'].length; 
	});
	swarmRad.domain([0, maxPosts]);
	
	//Adding xAxis
	var gX = svg.append("g")
      .attr("class", "g-x g-axis")
      .attr("transform", "translate(0," + brushHeight / 2 + ")")
      .call(xAxis);

	gX.select(".domain")
    .select(function() { return this.parentNode.insertBefore(this.cloneNode(true), this); })
      .attr("class", "g-halo");

	var tick = gX.selectAll(".tick")
      .each(function() { this.parentNode.appendChild(this); });

	tick.select("line")
      .attr("y1", -8)
      .attr("y2", 8);

	tick.filter(function(d) { return d in xTicks; })
      .attr("class", function(d) { return "tick tick-special tick-" + xTicks[d].toLowerCase(); });	
	
	//Appending slider and handler to parent svg
	slider = svg.append("g")
		  .attr("class", "g-slider")
		  .call(brush);

	slider.selectAll(".extent, .resize")
	  .remove();

	slider.select(".background")
	  .attr("height", brushHeight);

	handle = slider.append("circle")
	  .attr("class", "g-handle")
	  .attr("transform", "translate(0," + brushHeight / 2 + ")")
	  .attr("r", 8);
	  
	//Tree map visualization
	var mapTranslate = 'translate(' + 5 + ', ' + (brushHeight + padding.top) + ')';
	
	var newGroups = {};
	newGroups.name = groups.name;
	newGroups.children = [];
	
	groups.children.forEach(function(d, i){
		if(d.count > minGroupCount){
			newGroups.children.push(d);
		}
	});
	
	var data = nest.entries(newGroups.children);

	var newData = {
		key: 'All',
		values: data
	};
	
	var treeMapGroup = svg.append("g")
		.attr("class", "treeGroup")
		.attr("transform", mapTranslate);
		
    var cell = treeMapGroup.data([newData]).selectAll(".treeGroup")
      .data(treemap.nodes)
      .enter().append("g")
      .attr("class", "cell")
      .attr("transform", function(d) { return "translate(" + d.x + "," + d.y + ")"; });

	for(var i=0; i<data.length; i++){
		if(data[i].values.length >= 1){
			for(j=0; j<data[i].values.length; j++){
				var pos = {};
				pos.x = data[i].values[j].x + (data[i].values[j].dx/2);
				pos.y = data[i].values[j].y + (data[i].values[j].dy/2);
				
				var size = {};
				size.l = (data[i].values[j].dx);
				size.b = (data[i].values[j].dy);
				
				categoryCenterMap.set(data[i].values[j].name, pos);
				categorySizeMap.set(data[i].values[j].name, size);
			}
		}
	}
	
	var passivePos = categoryCenterMap.get("Passivity Island");
	var passiveSize = categorySizeMap.get("Passivity Island");
	
	swarmData.forEach(function(d, i){
		d.xloc = passivePos.x;
		d.yloc = passivePos.y;
		d.xvel = passivePos.x;
		d.yvel = passivePos.y;
	});
	
	cell.append("rect")
	  .attr("width", function(d) { return d.dx; })
	  .attr("height", function(d) { return d.dy; })
	  .style("fill", function(d, i){ 
			if(d.name == "Passivity Island"){
				return "#e0e9ef";
			}else{
				return color(d.name); 
			}
		});

	cell.append("text")
      .attr("x", function(d) { return d.dx / 2; })
      .attr("y", function(d) { return d.dy / 2; })
      .attr("dy", ".35em")
      .attr("text-anchor", "middle")
      .text(function(d) { return d.name; });
	  
	  
	//Swarm handler
	swarmNode = svg.selectAll("circle .swarm")
    .data(swarmData)
	.enter().append("circle")
    .attr("class", "swarm")
	.attr("cx", 0)
    .attr("cy", 0)
    .attr("r", 1);

	var circleRadius = passiveSize.l >= passiveSize.b? (passiveSize.b/2 - 20):(passiveSize.l/2 - 20);
	passivityCircle = svg.append("circle")
    .attr("class", "passivityCircle")
	.attr("fill", "white")
	.attr("cx", passivePos.x + 5)
    .attr("cy", passivePos.y + 70)
    .attr("r", circleRadius);

	passiveText = svg.append("text")
      .attr("x", passivePos.x)
      .attr("y", passivePos.y + 60)
      .attr("dy", ".85em")
      .attr("text-anchor", "middle")
	  .attr("font-size", "30px")
      .text(function(d) { return totalUsers });
	
	//.each - starts the animation by calling paused method
	playButton
      .on("click", paused)
      .each(paused);
}
	  
//Button toggle handler
function paused() {
  if (slider.node().__transition__) {
    slider.interrupt(); //Will be required when slider auto-moves
    this.textContent = "Play";
  } else {
    if (currentValue === maxValue) {
	   slider
        .call(brush.extent([currentValue = minValue, currentValue]))
        .call(brush.event)
        .call(brushBackground);
    }
    targetValue = maxValue;
	
    slider.transition()
        .duration(function(d, i){
			return (targetValue - currentValue) / (targetValue - minValue) * 30000
		})
		.tween("customTween", function() {
			return function(t) {

			};
		})
        .ease("linear")
        .call(brush.extent([targetValue, targetValue]))
        .call(brush.event)
        .call(brushBackground);
		
    this.textContent = "Pause";
  }
}

//Brushing event handler
function brushed() {
  if (d3.event.sourceEvent) { // not a programmatic event
    if (d3.event.sourceEvent.target.parentNode === this) { // clicked on the brush
      playButton.text("Play");
      targetValue = x.invert(d3.mouse(this)[0]);
      move();
    }
  } else {
    //Programmatic Event
	currentValue = brush.extent()[0];	
    handle.attr("cx", x(currentValue));
	
	var intCurrValue = Math.floor(currentValue);
	var moveIndex = [];	//Array to hold all the pointers to be moved for the current iteration
	var currCounter = 0;
	
	//Iterate over all posts of all users and find out the user pointers that need to be updated
	postData.forEach(function(d, i) {
		var currPosts = d['posts'];
		
		//Find the post just before current time for user
		var index = -1;
		for(var j=currPosts.length-1; j>=0; j--){
			if(currPosts[j]['t'] <= intCurrValue){
				index = j;
				break;
			}
		}
		
		if(index != -1 && activeUsersArr.indexOf(i) == -1){
			console.log('Pushing')
			activeUsersArr.push(i);
		}
		passiveText.text(totalUsers - activeUsersArr.length + 1);

		if(index > -1){
			var groupName = currPosts[index].group;

			if(categoryCenterMap.get(groupName)){
				moveIndex.push({
					counter: i,	//To get which user has moved for this iteration
					x: categoryCenterMap.get(groupName)['x'],
					y: categoryCenterMap.get(groupName)['y']
				});
			}
			//swarmData[index].count++;
		}
	});
	
	
	//Swarm Update code
	moveIndex.forEach(function(d, i){
		var counter = d['counter'];
		var xPos = d['x'];
		var yPos = d['y'];
		
		var userPosts = postData[counter]['posts'];
		var index = userPosts.map(function(el) {
		  return el['t'];
		}).indexOf(intCurrValue);
		
		//console.log(moveIndex);
		//console.log('  ' + intCurrValue + ' ' + index);
		var objToUpdate = swarmData[counter];
		objToUpdate.xloc = xPos + padding.left;
		objToUpdate.yloc = yPos + padding.top;
		objToUpdate.count = index;
	});

	//console.log(swarmData);
	
	swarmNode
		.transition()
		.duration(200)
		.ease("linear")
		.attr("transform", function(d) { return "translate(" + (d.xloc - 5) + "," + (d.yloc + brushHeight + padding.top - 10) + ")"; })
        .attr("r", function(d) { 
			//return Math.min(1 + 1000 * Math.abs(d.xvel * d.yvel), 100); 
			//return swarmRad(d.count);
			var r = swarmRad(Number(d.count) + 1);
			return r;
		});

	time1 = Date.now();
	//fps.text(Math.round(1000 / (time1 - time0)));
	time0 = time1;
  }
}

function brushBackground() {
  slider.select(".background")
      .attr("x", -40)
      .attr("width", width + 40);
}

//Enable slider movement
function move() {
  var copyValue = currentValue; // detect interrupt
  if (moving) return false;
  moving = true;
  
  d3.timer(function() {
    if (copyValue !== currentValue) return !(moving = false);

    copyValue = currentValue = Math.abs(currentValue - targetValue) < 1e-3
        ? targetValue
        : targetValue * alpha + currentValue * (1 - alpha);

    slider
        .call(brush.extent([currentValue, currentValue]))
        .call(brush.event)
        .call(brushBackground);

    return !(moving = currentValue !== targetValue);
  });
}

})();
