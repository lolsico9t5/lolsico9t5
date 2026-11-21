// A texture mesh lets the pinions fold at the shoulder while the neck and tail lag the torso.
const vertex = `
attribute vec2 uv;
uniform float phase;
uniform float bank;
uniform mediump float breath;
uniform mediump float jawPass;
uniform float speed;
varying vec2 tex;
varying float light;
void main() {
  tex = uv;
  float x = uv.x, y = uv.y;
  float wing = (1.0 - smoothstep(.64, .77, x))
             * (1.0 - smoothstep(.46 + .28*x, .59 + .26*x, y));
  float reach = max(0.0, .65-x)*.69 + max(0.0, .59-y)*.61;
  float beat = 2.0*phase - 1.0*reach;
  float fold = .27 - .38*cos(beat) + .07*sin(2.0*beat);
  float tail = (1.0-smoothstep(.15, .65, x)) * smoothstep(.48, .64, y);
  float head = smoothstep(.72, .96, x);
  vec2 pos = uv;
  // On fast passes the wings sweep back; the trailing membrane lags the rigid spars.
  pos.y += wing * reach * (fold + .10*speed);
  pos.x += wing * reach * (-.075*speed + .018*sin(beat*2.0 - 4.0*reach));
  pos.x += wing * reach * (.045 + .064*sin(beat-.4));
  pos.y += tail * ((.044 + .024*speed)*sin(phase*2.0+6.0*x) + bank*.039);
  pos.x += tail * .012*sin(phase*2.0+5.2*x-.6);
  pos.y += head * (.010*sin(2.0*phase+.5) - .008*bank);
  pos.y += .007*cos(2.0*phase)*(y-.68);
  pos.x -= breath * .012 * head;
  pos.y -= breath * .022 * head;
  if (jawPass > .5) {
    vec2 hinge = vec2(.89,.516);
    vec2 bone = (uv-hinge)*vec2(1.0,.505);
    float gape = breath*.31*smoothstep(.88,.94,x);
    mat2 rotateJaw = mat2(cos(gape),sin(gape),-sin(gape),cos(gape));
    pos += (rotateJaw*bone-bone)/vec2(1.0,.505);
  }
  pos = vec2(.055,.075) + pos*vec2(.89,.86);
  gl_Position = vec4(pos.x*2.0-1.0, 1.0-pos.y*2.0, 0.0, 1.0);
  light = wing * (.075*cos(beat-.35) - .045);
}`;
const fragment = `
precision mediump float;
uniform sampler2D dragon;
uniform mediump float breath;
uniform mediump float jawPass;
varying vec2 tex;
varying float light;
void main() {
  vec4 sampleColor = texture2D(dragon, tex);
  float lip = .514 + .30*(tex.x-.885) + .003*sin(29.0*(tex.x-.885));
  bool lowerJaw = tex.x>.885 && tex.y>lip && tex.y<lip+.065;
  if (jawPass>=0.0 && lowerJaw != (jawPass>.5)) discard;
  float warmth = breath*smoothstep(.69,.98,tex.x)*(1.0-smoothstep(.03,.19,abs(tex.y-lip)));
  gl_FragColor = vec4(sampleColor.rgb * (1.0 + light) + vec3(.46,.15,.025)*warmth*sampleColor.a, sampleColor.a);
}`;

export function createWingRig(canvas, image) {
  const gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: true });
  if (!gl) return null;
  const program = gl.createProgram();
  for (const [stage, code] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
    const shader = gl.createShader(stage);
    gl.shaderSource(shader, code);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const columns = 64, rows = 40, vertices = [], indices = [];
  for (let y = 0; y <= rows; y++) {
    for (let x = 0; x <= columns; x++) {
      vertices.push(x / columns, y / rows);
      if (x === columns || y === rows) continue;
      const a = y*(columns+1)+x, b = a+columns+1;
      indices.push(a,b,a+1, a+1,b,b+1);
    }
  }
  const mesh = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  const coord = gl.getAttribLocation(program, "uv");
  gl.enableVertexAttribArray(coord);
  gl.vertexAttribPointer(coord, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  for (const axis of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, axis, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  const angle = gl.getUniformLocation(program, "phase");
  const lean = gl.getUniformLocation(program, "bank");
  const breath = gl.getUniformLocation(program,"breath");
  const jaw = gl.getUniformLocation(program,"jawPass");
  const speed = gl.getUniformLocation(program,"speed");
  return (phase, bank = 0, heat = 0, pace = 0) => {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(angle, phase);
    gl.uniform1f(lean, bank);
    gl.uniform1f(breath,heat);
    gl.uniform1f(speed,pace);
    gl.uniform1f(jaw,heat>.012 ? 0 : -1);
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
    if (heat>.012) {
      gl.uniform1f(jaw,1);
      gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
    }
  };
}
