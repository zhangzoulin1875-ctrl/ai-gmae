import type { TerritoryGeometry } from '@wwi/shared';

const SHADER_SOURCE = /* wgsl */ `
struct Uniforms {
  scaleX: f32,
  scaleY: f32,
  panX: f32,
  panY: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

struct VertexInput {
  @location(0) pos: vec2<f32>,
  @location(1) color: vec3<f32>,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec3<f32>,
};

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  let clipX = (input.pos.x - u.panX) * u.scaleX;
  let clipY = -(input.pos.y - u.panY) * u.scaleY;
  out.position = vec4<f32>(clipX, clipY, 0.0, 1.0);
  out.color = input.color;
  return out;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  return vec4<f32>(input.color, 1.0);
}
`;

export interface CameraState {
  zoom: number; // device pixels per world unit
  panX: number; // world units
  panY: number; // world units
}

/**
 * Minimal WebGPU renderer for the strategy map. Draws filled,
 * fan-triangulated convex polygons (territories) with per-territory
 * flat color. Borders / labels / hover highlight are drawn by a
 * companion 2D overlay canvas (see GameMap.tsx) since WebGPU has no
 * native line/text primitives worth hand-rolling here.
 */
export class WebGPUMapRenderer {
  private canvas: HTMLCanvasElement;
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private pipeline: GPURenderPipeline | null = null;
  private uniformBuffer: GPUBuffer | null = null;
  private bindGroup: GPUBindGroup | null = null;
  private vertexBuffer: GPUBuffer | null = null;
  private vertexCount = 0;
  private format: GPUTextureFormat = 'bgra8unorm';

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && !!(navigator as any).gpu;
  }

  async init(): Promise<boolean> {
    if (!WebGPUMapRenderer.isSupported()) return false;

    try {
      const adapter = await (navigator as any).gpu.requestAdapter();
      if (!adapter) return false;
      const device: GPUDevice = await adapter.requestDevice();
      this.device = device;

      const context = this.canvas.getContext('webgpu') as unknown as GPUCanvasContext;
      this.format = (navigator as any).gpu.getPreferredCanvasFormat();
      context.configure({ device, format: this.format, alphaMode: 'opaque' });
      this.context = context;

      const shaderModule = device.createShaderModule({ code: SHADER_SOURCE });

      this.pipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
          module: shaderModule,
          entryPoint: 'vs_main',
          buffers: [
            {
              arrayStride: 5 * 4, // 2 pos + 3 color, f32
              attributes: [
                { shaderLocation: 0, offset: 0, format: 'float32x2' },
                { shaderLocation: 1, offset: 2 * 4, format: 'float32x3' },
              ],
            },
          ],
        },
        fragment: {
          module: shaderModule,
          entryPoint: 'fs_main',
          targets: [{ format: this.format }],
        },
        primitive: { topology: 'triangle-list' },
      });

      this.uniformBuffer = device.createBuffer({
        size: 4 * 4, // 4 floats
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      this.bindGroup = device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
      });

      return true;
    } catch (err) {
      console.error('[WebGPUMapRenderer] init failed:', err);
      return false;
    }
  }

  resize(widthPx: number, heightPx: number) {
    this.canvas.width = Math.max(1, Math.floor(widthPx));
    this.canvas.height = Math.max(1, Math.floor(heightPx));
  }

  /** Uploads territory geometry, fan-triangulated, colored by countryId via colorFn. */
  setTerritories(
    territories: TerritoryGeometry[],
    colorFn: (t: TerritoryGeometry) => [number, number, number]
  ) {
    if (!this.device) return;

    const floatsPerVertex = 5;
    const verts: number[] = [];

    for (const t of territories) {
      const poly = t.polygon;
      if (poly.length < 3) continue;
      const [r, g, b] = colorFn(t);
      for (let i = 1; i < poly.length - 1; i++) {
        const tri = [poly[0], poly[i], poly[i + 1]];
        for (const [x, y] of tri) {
          verts.push(x, y, r, g, b);
        }
      }
    }

    this.vertexCount = verts.length / floatsPerVertex;
    const data = new Float32Array(verts);

    if (this.vertexBuffer) this.vertexBuffer.destroy();
    this.vertexBuffer = this.device.createBuffer({
      size: Math.max(data.byteLength, 4),
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.vertexBuffer, 0, data);
  }

  setCamera(camera: CameraState) {
    if (!this.device || !this.uniformBuffer) return;
    const scaleX = (2 * camera.zoom) / this.canvas.width;
    const scaleY = (2 * camera.zoom) / this.canvas.height;
    const data = new Float32Array([scaleX, scaleY, camera.panX, camera.panY]);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, data);
  }

  render() {
    if (!this.device || !this.context || !this.pipeline || !this.vertexBuffer || this.vertexCount === 0) {
      return;
    }

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r: 0.06, g: 0.08, b: 0.1, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup!);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.draw(this.vertexCount);
    pass.end();

    this.device.queue.submit([encoder.finish()]);
  }

  dispose() {
    this.vertexBuffer?.destroy();
    this.uniformBuffer?.destroy();
  }
}
