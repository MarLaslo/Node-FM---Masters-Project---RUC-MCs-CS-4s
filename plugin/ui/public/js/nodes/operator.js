function MergeNode()
{
  this.addInput("Inputs", "array");
  this.addOutput("Array", "array");
  this.addProperty("num_inputs", 3);
  
  // Store the actual input data separately
  this._input_values = [];
}

MergeNode.title = "Merge";

// Custom rendering to show one input visually
MergeNode.prototype.onDrawForeground = function(ctx) {
  // Draw a label showing how many connections
  var connected = 0;
  for(var i = 0; i < this._input_values.length; i++) {
    if(this._input_values[i] !== undefined) connected++;
  }
  ctx.fillStyle = "#AAA";
  ctx.font = "10px Arial";
  ctx.fillText(connected + "/" + this._input_values.length, 10, this.size[1] - 5);
}

MergeNode.prototype.onExecute = function()
{
  // You'd still need multiple physical inputs in LiteGraph
  // This just changes the visual presentation
}

LiteGraph.registerNodeType("basic/Merge", MergeNode);