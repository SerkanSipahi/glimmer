import { Opcode, OpcodeJSON, UpdatingOpcode } from '../../opcodes';
import { Assert } from './vm';
import { Component, ComponentManager, ComponentDefinition } from '../../component/interfaces';
import { VM, UpdatingVM } from '../../vm';
import { CompiledArgs, EvaluatedArgs } from '../../compiled/expressions/args';
import { Templates } from '../../syntax/core';
import { DynamicScope } from '../../environment';
import { ReferenceCache, Revision, combine, isConst } from 'glimmer-reference';

export class PutDynamicComponentDefinitionOpcode extends Opcode {
  public type = "put-dynamic-component-definition";

  evaluate(vm: VM) {
    let reference = vm.frame.getOperand();
    let cache = isConst(reference) ? undefined : new ReferenceCache(reference);
    let definition = cache ? cache.peek() : reference.value();

    vm.frame.setComponentDefinition(definition);

    if (cache) {
      vm.updateWith(new Assert(cache));
    }
  }
}

export class PutComponentDefinitionOpcode extends Opcode {
  public type = "put-component-definition";

  constructor(private definition: ComponentDefinition<Component>) {
    super();
  }

  evaluate(vm: VM) {
    vm.frame.setComponentDefinition(this.definition);
  }
}

export class OpenComponentOpcode extends Opcode {
  public type = "open-component";

  constructor(
    private args: CompiledArgs,
    private shadow: string[],
    private templates: Templates
  ) {
    super();
  }

  evaluate(vm: VM) {
    let { args: rawArgs, shadow, templates } = this;

    let definition = vm.frame.getComponentDefinition();
    let dynamicScope = vm.pushDynamicScope();

    let manager = definition.manager;
    let hasDefaultBlock = templates && !!templates.default; // TODO Cleanup?
    let args = manager.prepareArgs(definition, rawArgs.evaluate(vm));
    let component = manager.create(definition, args, dynamicScope, hasDefaultBlock);
    let destructor = manager.getDestructor(component);
    if (destructor) vm.newDestroyable(destructor);

    let layout = manager.layoutFor(definition, component, vm.env);
    let callerScope = vm.scope();
    let selfRef = manager.getSelf(component);

    vm.beginCacheGroup();
    vm.stack().pushSimpleBlock();
    vm.pushRootScope(selfRef, layout.symbols);
    vm.invokeLayout(args, layout, templates, callerScope, component, manager, shadow);
    vm.env.didCreate(component, manager);

    vm.updateWith(new UpdateComponentOpcode(definition.name, component, manager, args, dynamicScope));
  }
}

export class UpdateComponentOpcode extends UpdatingOpcode {
  public type = "update-component";

  private lastUpdated: Revision;

  constructor(
    private name: string,
    private component: Component,
    private manager: ComponentManager<Component>,
    private args: EvaluatedArgs,
    private dynamicScope: DynamicScope,
  ) {
    super();

    let tag;
    let componentTag = manager.getTag(component);

    if (componentTag) {
      tag = this.tag = combine([args.tag, componentTag]);
    } else {
      tag = this.tag = args.tag;
    }

    this.lastUpdated = tag.value();
  }

  evaluate(vm: UpdatingVM) {
    let { component, manager, tag, args, dynamicScope, lastUpdated } = this;

    if (!tag.validate(lastUpdated)) {
      manager.update(component, args, dynamicScope);
      vm.env.didUpdate(component, manager);
      this.lastUpdated = tag.value();
    }
  }

  toJSON(): OpcodeJSON {
    return {
      guid: this._guid,
      type: this.type,
      args: [JSON.stringify(this.name)]
    };
  }
}

export class DidCreateElementOpcode extends Opcode {
  public type = "did-create-element";

  evaluate(vm: VM) {
    let manager = vm.frame.getManager();
    let component = vm.frame.getComponent();

    manager.didCreateElement(component, vm.stack().constructing, vm.stack().operations);
  }

  toJSON(): OpcodeJSON {
    return {
      guid: this._guid,
      type: this.type,
      args: ["$ARGS"]
    };
  }
}

// Slow path for non-specialized component invocations. Uses an internal
// named lookup on the args.
export class ShadowAttributesOpcode extends Opcode {
  public type = "shadow-attributes";

  evaluate(vm: VM) {
    let shadow = vm.frame.getShadow();

    if (!shadow) return;

    let named = vm.frame.getArgs().named;

    shadow.forEach(name => {
      vm.stack().setDynamicAttribute(name, named.get(name), false);
    });
  }

  toJSON(): OpcodeJSON {
    return {
      guid: this._guid,
      type: this.type,
      args: ["$ARGS"]
    };
  }
}

export class DidRenderLayoutOpcode extends Opcode {
  public type = "did-render-layout";

  evaluate(vm: VM) {
    let bounds = vm.stack().popBlock();
    let component = vm.frame.getComponent();
    let manager = vm.frame.getManager();

    manager.didRenderLayout(component, bounds);
  }
}

export class CloseComponentOpcode extends Opcode {
  public type = "close-component";

  evaluate(vm: VM) {
    vm.popScope();
    vm.popDynamicScope();
    vm.commitCacheGroup();
  }
}
